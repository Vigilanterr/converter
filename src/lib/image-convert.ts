import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
import sharp, { type Sharp } from "sharp";
import { ConversionError } from "./errors";
import type { ImageInputFormat, ImageOutputFormat } from "./validation";
import { outputExtension, outputMimeType } from "./validation";
import { traceToSvg } from "./vectorize";

export { ConversionError } from "./errors";

export interface ConversionOptions {
  outputFormat: ImageOutputFormat;
  quality: number;
  width?: number;
  height?: number;
  background?: string;
  removeMetadata: boolean;
  rotation: 0 | 90 | 180 | 270;
  /** Vectorisation controls. Only read when outputFormat is SVG. */
  trace?: TraceOptionsInput;
}

/**
 * The subset of vectorisation options that arrive over HTTP, before
 * normalisation. `vectorize` normalises every field itself, so these stay
 * loosely typed until they reach it.
 */
export interface TraceOptionsInput {
  mode?: unknown;
  colors?: unknown;
  detail?: unknown;
  smoothing?: unknown;
  maxTraceEdge?: unknown;
}

export interface ConversionSource {
  buffer: Buffer;
  format: ImageInputFormat;
}

export interface ConversionResult {
  data: Uint8Array;
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
  /** SVG only: set when the bitmap was reduced before tracing. */
  traceDownscaled?: boolean;
  /** SVG only: number of vector paths in the output. */
  tracePathCount?: number;
}

interface RasterImage {
  data: Buffer;
  width: number;
  height: number;
  hasAlpha: boolean;
  alreadyResized: boolean;
}

const DEFAULT_QUALITY = 85;
const POINTS_PER_PIXEL = 72 / 96;
const MAX_PDF_PAGE_POINTS = 14_400;
const OPAQUE_FALLBACK_BACKGROUND = "#ffffff";
const METADATA_SUPPORTED_OUTPUTS: ImageOutputFormat[] = [
  "PNG",
  "JPG",
  "WEBP",
  "AVIF",
  "TIFF"
];
const DECODE_ERROR_PATTERN =
  /unsupported image format|bad seek|unable to (?:read|decode)|vips_foreign_load|not in a known format|corrupt|premature|truncat|unknown (?:field|header)|unexpected end of file/i;

export function normalizeQuality(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_QUALITY;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
}

export function normalizeDimension(
  value: number | undefined
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  const rounded = Math.round(value);

  if (rounded < 1) {
    return undefined;
  }

  return Math.min(40_000, rounded);
}

export function normalizeBackgroundColor(
  value: string | undefined
): string | undefined {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const [, red, green, blue] = normalized;

    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return undefined;
}

function toConversionError(
  source: ConversionSource,
  error: unknown
): ConversionError {
  const message = error instanceof Error ? error.message : String(error);

  if (DECODE_ERROR_PATTERN.test(message)) {
    return new ConversionError(
      `The ${source.format} file could not be decoded. It may be corrupted or use a codec that is not supported.`,
      { cause: error }
    );
  }

  return new ConversionError("Image conversion failed.", {
    cause: error
  });
}

function svgToRaster(
  source: ConversionSource,
  options: ConversionOptions
): RasterImage {
  const svg = source.buffer.toString("utf8");

  try {
    const probe = new Resvg(svg, { fitTo: { mode: "original" } });
    const intrinsicWidth = probe.width;
    const intrinsicHeight = probe.height;

    if (intrinsicWidth < 1 || intrinsicHeight < 1) {
      throw new ConversionError(
        "The SVG does not declare a usable width and height."
      );
    }

    const scale = resolveScale(
      intrinsicWidth,
      intrinsicHeight,
      options.width,
      options.height
    );

    const renderer = new Resvg(svg, {
      ...(options.background ? { background: options.background } : {}),
      fitTo: { mode: "zoom", value: scale }
    });

    const rendered = renderer.render();

    if (rendered.width < 1 || rendered.height < 1) {
      throw new ConversionError(
        "The SVG could not be rendered at the requested size."
      );
    }

    return {
      data: rendered.asPng(),
      width: rendered.width,
      height: rendered.height,
      hasAlpha: !options.background,
      alreadyResized: true
    };
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    throw new ConversionError(
      "The SVG could not be rendered. Make sure the file contains valid SVG markup.",
      { cause: error }
    );
  }
}

function resolveScale(
  width: number,
  height: number,
  targetWidth?: number,
  targetHeight?: number
): number {
  if (!targetWidth && !targetHeight) {
    return 1;
  }

  const widthScale = targetWidth ? targetWidth / width : Number.POSITIVE_INFINITY;
  const heightScale = targetHeight
    ? targetHeight / height
    : Number.POSITIVE_INFINITY;

  return Math.max(0.01, Math.min(widthScale, heightScale));
}

async function rasterToImage(
  source: ConversionSource
): Promise<RasterImage> {
  try {
    const metadata = await sharp(source.buffer, {
      failOn: "none"
    }).metadata();

    if (!metadata.width || !metadata.height) {
      throw new ConversionError(
        "The image dimensions could not be determined."
      );
    }

    return {
      data: source.buffer,
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha ?? false,
      alreadyResized: false
    };
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    throw toConversionError(source, error);
  }
}

async function prepareImage(
  source: ConversionSource,
  options: ConversionOptions
): Promise<RasterImage> {
  return source.format === "SVG"
    ? svgToRaster(source, options)
    : rasterToImage(source);
}

function createPipeline(
  image: RasterImage,
  options: ConversionOptions,
  outputFormat: ImageOutputFormat
): Sharp {
  let pipeline = sharp(image.data, { failOn: "none" });

  if (options.rotation !== 0) {
    pipeline = pipeline.rotate(options.rotation);
  }

  if (!image.alreadyResized && (options.width || options.height)) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: "inside",
      withoutEnlargement: false
    });
  }

  if (outputFormat === "JPG") {
    pipeline = pipeline.flatten({
      background: options.background ?? OPAQUE_FALLBACK_BACKGROUND
    });
  }

  if (
    !options.removeMetadata &&
    METADATA_SUPPORTED_OUTPUTS.includes(outputFormat)
  ) {
    pipeline = pipeline.withMetadata();
  }

  return pipeline;
}

function encode(
  pipeline: Sharp,
  options: ConversionOptions,
  outputFormat: ImageOutputFormat
): Sharp {
  const quality = options.quality;

  switch (outputFormat) {
    case "PNG":
      return pipeline.png({ compressionLevel: 9 });
    case "JPG":
      return pipeline.jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: "4:2:0"
      });
    case "WEBP":
      return pipeline.webp({ quality });
    case "AVIF":
      return pipeline.avif({ quality, effort: 4 });
    case "TIFF":
      return pipeline.tiff({ quality });
    case "GIF":
      return pipeline.gif({ effort: 7 });
    default:
      throw new ConversionError("Unsupported output format.");
  }
}

async function renderTo(
  source: ConversionSource,
  image: RasterImage,
  options: ConversionOptions,
  outputFormat: ImageOutputFormat
): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await encode(
      createPipeline(image, options, outputFormat),
      options,
      outputFormat
    ).toBuffer({ resolveWithObject: true });

    return {
      data,
      width: info.width ?? image.width,
      height: info.height ?? image.height
    };
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    throw toConversionError(source, error);
  }
}

export async function convertImage(
  source: ConversionSource,
  options: ConversionOptions
): Promise<ConversionResult> {
  if (options.outputFormat === "SVG") {
    return convertImageToSvg(source, options);
  }

  const image = await prepareImage(source, options);
  const rendered = await renderTo(
    source,
    image,
    options,
    options.outputFormat
  );

  return {
    data: new Uint8Array(rendered.data),
    mimeType: outputMimeType(options.outputFormat),
    extension: outputExtension(options.outputFormat),
    width: rendered.width,
    height: rendered.height
  };
}

/**
 * SVG is not a re-encode: every other output path hands bytes to sharp, which
 * has no SVG encoder. Tracing is CPU-bound and quadratic-ish in path count, so
 * `vectorize` bounds the bitmap it feeds to the tracer before doing any work.
 */
async function convertImageToSvg(
  source: ConversionSource,
  options: ConversionOptions
): Promise<ConversionResult> {
  const image = await prepareImage(source, options);

  const result = await traceToSvg(image.data, {
    mode: options.trace?.mode,
    colors: options.trace?.colors,
    detail: options.trace?.detail,
    smoothing: options.trace?.smoothing,
    maxTraceEdge: options.trace?.maxTraceEdge,
    background: options.background,
    width: options.width,
    height: options.height,
    rotation: options.rotation
  });

  if (result.pathCount === 0) {
    throw new ConversionError(
      "The tracer produced no vector paths. Try a different trace mode or a higher colour count."
    );
  }

  return {
    data: new Uint8Array(Buffer.from(result.svg, "utf8")),
    mimeType: outputMimeType("SVG"),
    extension: outputExtension("SVG"),
    width: result.width,
    height: result.height,
    traceDownscaled: result.downscaled,
    tracePathCount: result.pathCount
  };
}

export async function convertImagesToPdf(
  sources: ConversionSource[],
  options: ConversionOptions
): Promise<ConversionResult> {
  if (sources.length === 0) {
    throw new ConversionError("At least one image is required.");
  }

  const pdf = await PDFDocument.create();

  pdf.setProducer("DarConverter");
  pdf.setCreator("DarConverter");
  pdf.setCreationDate(new Date());

  for (const source of sources) {
    const image = await prepareImage(source, options);
    const pageFormat: ImageOutputFormat = image.hasAlpha ? "PNG" : "JPG";

    let rendered: { data: Buffer; width: number; height: number };

    try {
      rendered = await renderTo(source, image, options, pageFormat);
    } catch (error) {
      throw new ConversionError(
        `A page could not be prepared for the PDF: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
        { cause: error }
      );
    }

    const embedded =
      pageFormat === "PNG"
        ? await pdf.embedPng(rendered.data)
        : await pdf.embedJpg(rendered.data);

    let pageWidth = rendered.width * POINTS_PER_PIXEL;
    let pageHeight = rendered.height * POINTS_PER_PIXEL;

    if (pageWidth > MAX_PDF_PAGE_POINTS || pageHeight > MAX_PDF_PAGE_POINTS) {
      const scale =
        MAX_PDF_PAGE_POINTS / Math.max(pageWidth, pageHeight);

      pageWidth *= scale;
      pageHeight *= scale;
    }

    const page = pdf.addPage([
      Math.max(1, pageWidth),
      Math.max(1, pageHeight)
    ]);

    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight
    });
  }

  const data = await pdf.save();

  return {
    data,
    mimeType: outputMimeType("PDF"),
    extension: outputExtension("PDF"),
    width: null,
    height: null
  };
}
