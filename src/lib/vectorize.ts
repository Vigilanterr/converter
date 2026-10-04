import ImageTracer from "imagetracerjs";
import sharp from "sharp";
import { ConversionError } from "./errors";

/**
 * Raster -> SVG is vectorisation, not conversion. There is no lossless path
 * from a bitmap to a vector format: we reconstruct outlines from traced pixel
 * regions, so the result approximates the source rather than reproducing it.
 */

export type TraceMode = "color" | "grayscale" | "lineart";

export interface TraceOptions {
  /**
   * User-tunable fields stay `unknown`: they arrive from form data, and every
   * one of them is normalised below before use. Typed loosely on purpose so a
   * malformed request can never skip normalisation.
   */
  mode?: unknown;
  colors?: unknown;
  /** Corner retention. Low = smooth curves, high = angular. 0..1 */
  detail?: unknown;
  /** Path simplification. Low = more points, tighter shapes. 0..1 */
  smoothing?: unknown;
  /** Background painted under transparent pixels before tracing. */
  background?: string;
  /** Longest edge of the bitmap handed to the tracer. */
  maxTraceEdge?: unknown;
  width?: number;
  height?: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface TraceResult {
  svg: string;
  width: number;
  height: number;
  pathCount: number;
  /** True when the bitmap was downscaled before tracing. */
  downscaled: boolean;
}

export const TRACE_MODES: TraceMode[] = ["color", "grayscale", "lineart"];

const DEFAULT_TRACE_EDGE = 1_200;
const MAX_TRACE_EDGE = 4_000;
const MIN_COLORS = 2;
const MAX_COLORS = 64;

export function normalizeTraceMode(value: unknown): TraceMode {
  const normalized = String(value ?? "").trim().toLowerCase();

  return (TRACE_MODES as string[]).includes(normalized)
    ? (normalized as TraceMode)
    : "color";
}

export function normalizeTraceColors(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 8;
  }

  return Math.min(MAX_COLORS, Math.max(MIN_COLORS, Math.round(parsed)));
}

function normalizeUnit(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function normalizeTraceEdge(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TRACE_EDGE;
  }

  return Math.min(MAX_TRACE_EDGE, Math.max(64, Math.round(parsed)));
}

/**
 * `detail` and `smoothing` are inverted into imagetracerjs' own scales:
 *   pathomit    — pixels a path must span before it is kept. Higher = simpler.
 *   roundcoords — coordinate rounding. Higher = fewer, blunter points.
 * We also turn curve smoothing up when the caller asks for smooth output.
 */
/**
 * imagetracerjs merges options into a single process-wide `defaultoptions`
 * object, and its merge shares the *same* object references for nested groups.
 * Any key we leave out is therefore inherited from whatever the previous
 * request happened to write — so a colour trace followed by a line-art trace
 * makes the second one silently reuse the first one's fill/stroke settings.
 *
 * The fix is to specify every documented key on every call. That leaves nothing
 * to inherit, so results stop depending on request order within the process.
 */
function buildTracerOptions(mode: TraceMode, colors: number, detail: number, smoothing: number) {
  const pathOmit = Math.round(1 + (1 - detail) * 24);
  const roundCoords = Math.round(1 + smoothing * 6);
  const strokeWidth = 1 + Math.round(smoothing * 2);

  const shared = {
    linetracing: false,
    strokewidth: 0,
    linefilter: true,
    layered: false,
    layers: 0 as const,
    linejoin: "miter" as const,
    linecap: "butt" as const,
    closedpathfill: false,
    straightline: false,
    pathomit: pathOmit,
    rightangleenhance: detail > 0.7,
    colorsampling: 2 as const,
    numberofcolors: colors,
    mincolorratio: 0,
    colorquantcycles: 3,
    strokelayer: 0,
    layeropacity: 1,
    blurradius: 0,
    blurpower: 0,
    blurfilter: true,
    roundcoords: roundCoords,
    scale: 1,
    viewbox: false,
  };

  if (mode === "lineart") {
    return {
      ...shared,
      linetracing: true,
      strokewidth: strokeWidth,
      linefilter: true,
      numberofcolors: 2,
      colorsampling: 2 as const,
      colorquantcycles: 1,
      pathomit: Math.round(1 + (1 - detail) * 12),
      // Geometry follows the stroke, not a filled outline.
      straightline: true,
      rightangleenhance: detail > 0.7,
      roundcoords: Math.min(2, roundCoords),
      blurradius: 1,
      blurpower: 1,
      strokepath: { enabled: true, mode: "line" as const, width: strokeWidth },
      fillpath: { enabled: false, mode: "none" as const, opacity: 1, width: 0 },
    };
  }

  return {
    ...shared,
    numberofcolors: colors,
    strokepath: { enabled: false, mode: "none" as const, width: 0 },
    fillpath: { enabled: true, mode: "pixel" as const, opacity: 1, width: 0 },
  };
}

/**
 * imagetracerjs quantises colours but never removes chroma, so asking it for a
 * greyscale trace of a colour photo returns tinted regions. Desaturating the
 * bitmap up front is what actually guarantees a greyscale result, and it makes
 * the outcome independent of how the tracer picks its palette.
 */
function desaturate(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    const luma =
      0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const grey = Math.round(luma);

    data[i] = grey;
    data[i + 1] = grey;
    data[i + 2] = grey;
  }
}

interface TraceBitmap {
  data: Buffer;
  width: number;
  height: number;
  downscaled: boolean;
}

async function toTraceBitmap(
  buffer: Buffer,
  options: TraceOptions
): Promise<TraceBitmap> {
  const maxEdge = normalizeTraceEdge(options.maxTraceEdge);

  let pipeline = sharp(buffer, { failOn: "none" });

  const metadata = await pipeline.metadata();

  if (!metadata.width || !metadata.height) {
    throw new ConversionError("The image dimensions could not be determined.");
  }

  // sharp applies .rotate() before .resize() regardless of call order, so the
  // resize targets must be derived from POST-rotation dimensions or a 90/270
  // turn comes out stretched.
  const swapsAxes = options.rotation === 90 || options.rotation === 270;
  const sourceWidth = swapsAxes ? metadata.height : metadata.width;
  const sourceHeight = swapsAxes ? metadata.width : metadata.height;

  if (options.rotation !== 0) {
    pipeline = pipeline.rotate(options.rotation);
  }

  const requestedWidth = options.width;
  const requestedHeight = options.height;

  if (requestedWidth || requestedHeight) {
    pipeline = pipeline.resize({
      width: requestedWidth,
      height: requestedHeight,
      fit: "inside",
      withoutEnlargement: false
    });
  } else {
    // Keep the ratio as a float: rounding it to an integer first collapses to
    // zero for anything more than ~2x oversized and yields a 1x1 bitmap.
    const scale = Math.max(sourceWidth, sourceHeight) / maxEdge;

    if (scale > 1) {
      pipeline = pipeline.resize({
        width: Math.max(1, Math.round(sourceWidth / scale)),
        height: Math.max(1, Math.round(sourceHeight / scale)),
        fit: "fill",
        kernel: "lanczos3"
      });
    }
  }

  if (normalizeTraceMode(options.mode) !== "lineart") {
    pipeline = pipeline.flatten({
      background: options.background ?? "#ffffff"
    });
  }

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    downscaled:
      Math.max(info.width, info.height) < Math.max(sourceWidth, sourceHeight)
  };
}

/**
 * imagetracerjs writes a vendor `desc` attribute into its output. Strip it and
 * re-root the document so the shipped file is clean SVG that opens cleanly in
 * Illustrator, Figma and Inkscape.
 */
function cleanSvg(svg: string, width: number, height: number): string {
  const body = svg
    .replace(/<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/\s*desc="[^"]*"/gi, "")
    .trim();

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${body}</svg>`
  );
}

export async function traceToSvg(
  buffer: Buffer,
  options: TraceOptions
): Promise<TraceResult> {
  const bitmap = await toTraceBitmap(buffer, options);
  const colors = normalizeTraceColors(options.colors);
  const mode = normalizeTraceMode(options.mode);
  const detail = normalizeUnit(options.detail, 0.5);
  const smoothing = normalizeUnit(options.smoothing, 0.5);

  const pixels = new Uint8ClampedArray(
    bitmap.data.buffer,
    bitmap.data.byteOffset,
    bitmap.data.byteLength
  );

  if (mode === "grayscale") {
    desaturate(pixels);
  }

  let traced: string;

  try {
    traced = ImageTracer.imagedataToSVG(
      { width: bitmap.width, height: bitmap.height, data: pixels },
      buildTracerOptions(mode, colors, detail, smoothing)
    );
  } catch (error) {
    throw new ConversionError(
      "The image could not be traced into vector paths. Try a lower colour count or a smaller image.",
      { cause: error }
    );
  }

  const svg = cleanSvg(traced, bitmap.width, bitmap.height);

  return {
    svg,
    width: bitmap.width,
    height: bitmap.height,
    pathCount: (svg.match(/<path/g) ?? []).length,
    downscaled: bitmap.downscaled
  };
}

export const TRACE_MODE_LABELS: Record<TraceMode, string> = {
  color: "Colour regions",
  grayscale: "Greyscale",
  lineart: "Line art"
};

export const TRACE_MODE_HINTS: Record<TraceMode, string> = {
  color: "Flattens the image into N colour shapes. Best for logos and flat artwork.",
  grayscale:
    "Two-tone regions only. Good for scans, stamps and black-and-white artwork.",
  lineart:
    "Traces edges into strokes on a transparent background. Best for sketches, maps and lettering."
};