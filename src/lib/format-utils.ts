const MIME_BY_FORMAT: Record<string, string> = {
  PNG: "image/png",
  JPG: "image/jpeg",
  WEBP: "image/webp",
  GIF: "image/gif",
  BMP: "image/bmp",
  TIFF: "image/tiff",
  AVIF: "image/avif",
  SVG: "image/svg+xml",
  PDF: "application/pdf"
};

const EXTENSION_BY_FORMAT: Record<string, string> = {
  PNG: "png",
  JPG: "jpg",
  WEBP: "webp",
  GIF: "gif",
  BMP: "bmp",
  TIFF: "tiff",
  AVIF: "avif",
  SVG: "svg",
  PDF: "pdf"
};

/** JPEG and TIF are written the way the rest of the project spells them. */
export function normalizeFormatLabel(format: string): string {
  const key = format.trim().toUpperCase();

  if (key === "JPEG" || key === "JPE") {
    return "JPG";
  }

  if (key === "TIF") {
    return "TIFF";
  }

  return key;
}

export function mimeForFormat(format: string): string {
  return MIME_BY_FORMAT[normalizeFormatLabel(format)] ?? "application/octet-stream";
}

export function extensionForFormat(format: string): string {
  return EXTENSION_BY_FORMAT[normalizeFormatLabel(format)] ?? normalizeFormatLabel(format).toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatPixelSize(width: number, height: number): string {
  return `${width} × ${height}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left || 1;
}

/** "16:9" for friendly proportions, a decimal ratio for awkward ones. */
export function aspectRatioLabel(width: number, height: number): string {
  if (!width || !height) {
    return "—";
  }

  const divisor = greatestCommonDivisor(width, height);
  const columns = Math.round(width / divisor);
  const rows = Math.round(height / divisor);

  if (columns <= 64 && rows <= 64) {
    return `${columns}:${rows}`;
  }

  return `${(width / height).toFixed(2)}:1`;
}
