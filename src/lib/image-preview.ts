import {
  mimeForFormat,
  normalizeFormatLabel
} from "./format-utils";

/**
 * Longest edge of the canvas used for a live preview. The final conversion
 * always works from the original file, so this only bounds preview work.
 */
export const PREVIEW_MAX_EDGE = 1600;

/** Debounce window for option changes so slider drags do not encode on every step. */
export const PREVIEW_DEBOUNCE_MS = 150;

/** Transparency is analysed on a thumbnail of this size, never on full pixels. */
export const TRANSPARENCY_SAMPLE_EDGE = 96;

export const UNSUPPORTED_PREVIEW_NOTE =
  "Live preview is not available for this format. The file will be processed securely on the server when you start the conversion.";

export const PREVIEW_FAILED_NOTE =
  "Preview unavailable. You can still use the server converter.";

export const REDUCED_PREVIEW_NOTE =
  "This file is large. Preview may use a reduced resolution for performance.";

export const FALLBACK_PREVIEW_NOTE =
  "This browser cannot encode the requested format, so the preview shows PNG instead.";

export type PreviewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "updating"
  | "error";

export type PreviewOutputFormat = "PNG" | "JPG" | "WEBP";

export interface PreviewOptions {
  outputFormat: PreviewOutputFormat;
  quality: number;
  width?: number | null;
  height?: number | null;
  background?: string | null;
  rotation?: number;
  /** Paint the background under transparent pixels, mirroring a JPG flatten. */
  flatten?: boolean;
}

export interface PreviewRender {
  canvas: HTMLCanvasElement;
  /** Size of the preview canvas. */
  width: number;
  height: number;
  /** Size of the file the final conversion will produce. */
  finalWidth: number;
  finalHeight: number;
  /** True when the preview was rendered below the final resolution. */
  reduced: boolean;
}

export interface EncodedPreview {
  blob: Blob;
  mimeType: string;
  format: PreviewOutputFormat;
  note: string | null;
}

/** Everything the preview panels need to describe one side of the comparison. */
export interface PreviewMeta {
  name: string;
  format: string;
  size: number;
  sizeLabel: "File size" | "Estimated size";
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  url?: string;
}

const encoderSupportCache = new Map<string, boolean>();

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("This browser does not provide a 2D canvas.");
  }

  return context;
}

export function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  const objectUrl = typeof source === "string" ? source : URL.createObjectURL(source);
  const shouldRevoke = typeof source !== "string";

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.decoding = "async";

    image.onload = () => {
      if (shouldRevoke) {
        URL.revokeObjectURL(objectUrl);
      }

      resolve(image);
    };

    image.onerror = () => {
      if (shouldRevoke) {
        URL.revokeObjectURL(objectUrl);
      }

      reject(new Error("The image could not be read."));
    };

    image.src = objectUrl;
  });
}

/** Aspect-preserving "fit inside the box" sizing, the same rule the server uses. */
export function computeTargetSize(
  naturalWidth: number,
  naturalHeight: number,
  width?: number | null,
  height?: number | null
): { width: number; height: number } {
  if (!width && !height) {
    return { width: naturalWidth, height: naturalHeight };
  }

  const ratio = Math.min(
    width ? width / naturalWidth : Number.POSITIVE_INFINITY,
    height ? height / naturalHeight : Number.POSITIVE_INFINITY
  );

  return {
    width: Math.max(1, Math.round(naturalWidth * ratio)),
    height: Math.max(1, Math.round(naturalHeight * ratio))
  };
}

export function limitForPreview(
  width: number,
  height: number,
  limit = PREVIEW_MAX_EDGE
): { width: number; height: number; reduced: boolean } {
  const longest = Math.max(width, height);

  if (longest <= limit) {
    return { width, height, reduced: false };
  }

  const scale = limit / longest;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    reduced: true
  };
}

export function resizeImage(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = requireContext(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas;
}

export function rotateImage(
  canvas: HTMLCanvasElement,
  rotation: number
): HTMLCanvasElement {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

  if (normalized === 0) {
    return canvas;
  }

  const swapAxes = normalized === 90 || normalized === 270;
  const rotated = document.createElement("canvas");

  rotated.width = swapAxes ? canvas.height : canvas.width;
  rotated.height = swapAxes ? canvas.width : canvas.height;

  const context = requireContext(rotated);
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

/** Fills only the transparent pixels, so it behaves like a flatten onto a colour. */
export function applyBackground(
  canvas: HTMLCanvasElement,
  color: string
): HTMLCanvasElement {
  const context = canvas.getContext("2d");

  if (!context) {
    return canvas;
  }

  context.save();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();

  return canvas;
}

export function createPreview(
  image: HTMLImageElement,
  options: PreviewOptions
): PreviewRender {
  const target = computeTargetSize(
    image.naturalWidth,
    image.naturalHeight,
    options.width,
    options.height
  );
  const preview = limitForPreview(target.width, target.height);
  const rotation = options.rotation ?? 0;
  const swapAxes = ((Math.round(rotation / 90) % 2) + 2) % 2 === 1;

  let canvas = resizeImage(image, preview.width, preview.height);
  canvas = rotateImage(canvas, rotation);

  if (options.flatten) {
    canvas = applyBackground(canvas, options.background || "#ffffff");
  }

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    finalWidth: swapAxes ? target.height : target.width,
    finalHeight: swapAxes ? target.width : target.height,
    reduced: preview.reduced
  };
}

export function exportCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("The browser could not encode the image."));
          }
        },
        mimeType,
        quality
      );
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error("The browser could not encode the image.")
      );
    }
  });
}

export function canEncodeFormat(mimeType: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const cached = encoderSupportCache.get(mimeType);

  if (cached !== undefined) {
    return cached;
  }

  const probe = document.createElement("canvas");

  probe.width = 1;
  probe.height = 1;

  let supported = false;

  try {
    supported = probe.toDataURL(mimeType).startsWith(`data:${mimeType}`);
  } catch {
    supported = false;
  }

  encoderSupportCache.set(mimeType, supported);

  return supported;
}

/**
 * Encodes the preview canvas, falling back to PNG when the browser cannot
 * produce the requested format so the panel always has something to show.
 */
export async function encodePreview(
  canvas: HTMLCanvasElement,
  options: { outputFormat: PreviewOutputFormat; quality: number }
): Promise<EncodedPreview> {
  const requested = normalizeFormatLabel(options.outputFormat);
  const requestedMime = mimeForFormat(requested);
  const lossy = requested !== "PNG";
  const quality = lossy ? Math.min(100, Math.max(1, options.quality)) / 100 : undefined;

  if (canEncodeFormat(requestedMime)) {
    const blob = await exportCanvas(canvas, requestedMime, quality);

    if (!blob.type || blob.type === requestedMime) {
      return {
        blob,
        mimeType: requestedMime,
        format: requested as PreviewOutputFormat,
        note: null
      };
    }
  }

  const fallback = await exportCanvas(canvas, mimeForFormat("PNG"));

  return {
    blob: fallback,
    mimeType: mimeForFormat("PNG"),
    format: "PNG",
    note: FALLBACK_PREVIEW_NOTE
  };
}

/**
 * The preview may be rendered smaller than the final output, so the encoded
 * size is scaled by the pixel ratio. Labelled "Estimated size" in the UI.
 */
export function estimateOutputSize(
  previewBytes: number,
  render: Pick<PreviewRender, "width" | "height" | "finalWidth" | "finalHeight">
): number {
  const previewPixels = render.width * render.height;
  const finalPixels = render.finalWidth * render.finalHeight;

  if (previewPixels <= 0 || finalPixels <= 0 || previewPixels === finalPixels) {
    return previewBytes;
  }

  return Math.max(1, Math.round(previewBytes * (finalPixels / previewPixels)));
}

/** Samples a thumbnail of the image and reports whether any pixel is see-through. */
export function hasTransparency(
  source: CanvasImageSource,
  width: number,
  height: number
): boolean {
  if (typeof document === "undefined" || !width || !height) {
    return false;
  }

  const scale = Math.min(1, TRANSPARENCY_SAMPLE_EDGE / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  try {
    const context = requireContext(canvas);

    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(source, 0, 0, sampleWidth, sampleHeight);

    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 255) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}
