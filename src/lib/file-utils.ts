import { normalizeFormatLabel } from "./format-utils";

const FORMAT_BY_MIME: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
  "image/gif": "GIF",
  "image/bmp": "BMP",
  "image/tiff": "TIFF",
  "image/avif": "AVIF",
  "application/pdf": "PDF"
};

const FORMAT_BY_EXTENSION: Record<string, string> = {
  jpeg: "JPG",
  jpg: "JPG",
  png: "PNG",
  webp: "WEBP",
  svg: "SVG",
  gif: "GIF",
  bmp: "BMP",
  tif: "TIFF",
  tiff: "TIFF",
  avif: "AVIF",
  pdf: "PDF"
};

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);

  return match ? match[1].toLowerCase() : "";
}

export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "") || "converted";
}

/** Best-effort format label from the MIME type, falling back to the extension. */
export function formatLabelFromFile(file: File): string {
  const byMime = FORMAT_BY_MIME[file.type.trim().toLowerCase()];

  if (byMime) {
    return byMime;
  }

  const byExtension = FORMAT_BY_EXTENSION[extensionOf(file.name)];

  if (byExtension) {
    return byExtension;
  }

  const extension = extensionOf(file.name);

  return extension ? normalizeFormatLabel(extension) : "FILE";
}
