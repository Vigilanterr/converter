export const imageInputFormats = [
  "PNG",
  "JPG",
  "JPEG",
  "WEBP",
  "GIF",
  "TIFF",
  "AVIF",
  "SVG",
  "HEIC",
  "HEIF"
] as const;

export type ImageInputFormat = (typeof imageInputFormats)[number];

export const imageOutputFormats = [
  "PNG",
  "JPG",
  "WEBP",
  "AVIF",
  "TIFF",
  "GIF",
  "PDF",
  "SVG"
] as const;

export type ImageOutputFormat = (typeof imageOutputFormats)[number];

const FORMAT_EXTENSIONS: Record<string, ImageInputFormat> = {
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPG",
  webp: "WEBP",
  gif: "GIF",
  tif: "TIFF",
  tiff: "TIFF",
  avif: "AVIF",
  svg: "SVG",
  heic: "HEIC",
  heif: "HEIF"
};

const FORMAT_MIME_TYPES: Record<string, ImageInputFormat> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "image/pjpeg": "JPG",
  "image/webp": "WEBP",
  "image/gif": "GIF",
  "image/tiff": "TIFF",
  "image/avif": "AVIF",
  "image/svg+xml": "SVG",
  "image/heic": "HEIC",
  "image/heif": "HEIF"
};

const FORMAT_ALIASES: Partial<Record<ImageInputFormat, ImageInputFormat>> = {
  JPEG: "JPG",
  HEIF: "HEIC"
};

const OUTPUT_MIME_TYPES: Record<ImageOutputFormat, string> = {
  PNG: "image/png",
  JPG: "image/jpeg",
  WEBP: "image/webp",
  AVIF: "image/avif",
  TIFF: "image/tiff",
  GIF: "image/gif",
  PDF: "application/pdf",
  SVG: "image/svg+xml"
};

const OUTPUT_EXTENSIONS: Record<ImageOutputFormat, string> = {
  PNG: "png",
  JPG: "jpg",
  WEBP: "webp",
  AVIF: "avif",
  TIFF: "tiff",
  GIF: "gif",
  PDF: "pdf",
  SVG: "svg"
};

const OUTPUT_ACCEPT: Record<ImageOutputFormat, string[]> = {
  PNG: ["png"],
  JPG: ["jpg", "jpeg"],
  WEBP: ["webp"],
  AVIF: ["avif"],
  TIFF: ["tiff", "tif"],
  GIF: ["gif"],
  PDF: ["pdf"],
  SVG: ["svg"]
};

const SVG_SNIFF_LENGTH = 1024;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function canonicalInputFormat(
  format: ImageInputFormat
): ImageInputFormat {
  return FORMAT_ALIASES[format] ?? format;
}

export function canonicalOutputFormat(
  value: string
): ImageOutputFormat | null {
  const normalized = value.trim().toUpperCase();

  if (normalized === "JPEG") {
    return "JPG";
  }

  return (imageOutputFormats as readonly string[]).includes(normalized)
    ? (normalized as ImageOutputFormat)
    : null;
}

export function outputExtension(format: ImageOutputFormat): string {
  return OUTPUT_EXTENSIONS[format];
}

export function outputMimeType(format: ImageOutputFormat): string {
  return OUTPUT_MIME_TYPES[format];
}

export function outputAcceptAttribute(
  format: ImageOutputFormat
): string {
  return OUTPUT_ACCEPT[format]
    .map((extension) => `.${extension}`)
    .join(",");
}

export function inputAcceptAttribute(
  formats: readonly string[]
): string {
  return formats
    .map((format) => canonicalInputFormat(format.toUpperCase() as ImageInputFormat))
    .flatMap((format) => {
      const extensions = Object.entries(FORMAT_EXTENSIONS)
        .filter(([, value]) => canonicalInputFormat(value) === format)
        .map(([key]) => `.${key}`);

      return extensions.length > 0 ? extensions : [];
    })
    .filter((extension, index, all) => all.indexOf(extension) === index)
    .join(",");
}

function ascii(buffer: Buffer, start: number, length: number): string {
  return buffer.subarray(start, start + length).toString("latin1");
}

function matchesAt(
  buffer: Buffer,
  bytes: number[],
  offset = 0
): boolean {
  if (buffer.length < offset + bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function looksLikeSvg(buffer: Buffer): boolean {
  const start =
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
      ? 3
      : 0;

  const head = ascii(
    buffer,
    start,
    Math.min(SVG_SNIFF_LENGTH, buffer.length - start)
  )
    .trimStart()
    .toLowerCase();

  if (head.startsWith("<svg")) {
    return true;
  }

  if (!head.startsWith("<?xml")) {
    return false;
  }

  return head.includes("<svg");
}

function detectIsoBaseMediaFormat(buffer: Buffer): ImageInputFormat | null {
  if (ascii(buffer, 4, 4) !== "ftyp") {
    return null;
  }

  const brand = ascii(buffer, 8, 4).toLowerCase();

  if (brand.startsWith("avi")) {
    return "AVIF";
  }

  if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1") {
    return "HEIC";
  }

  return null;
}

export function detectFormatFromBytes(
  buffer: Buffer
): ImageInputFormat | null {
  if (matchesAt(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "PNG";
  }

  if (matchesAt(buffer, [0xff, 0xd8, 0xff])) {
    return "JPG";
  }

  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WEBP") {
    return "WEBP";
  }

  if (ascii(buffer, 0, 6).startsWith("GIF8")) {
    return "GIF";
  }

  if (
    matchesAt(buffer, [0x49, 0x49, 0x2a, 0x00]) ||
    matchesAt(buffer, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return "TIFF";
  }

  const isoBaseMedia = detectIsoBaseMediaFormat(buffer);

  if (isoBaseMedia) {
    return isoBaseMedia;
  }

  if (looksLikeSvg(buffer)) {
    return "SVG";
  }

  return null;
}

export function detectFormatFromName(
  fileName: string
): ImageInputFormat | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());

  if (!match) {
    return null;
  }

  const format = FORMAT_EXTENSIONS[match[1].toLowerCase()];

  return format ? canonicalInputFormat(format) : null;
}

export function detectFormatFromMime(
  mimeType: string
): ImageInputFormat | null {
  const format = FORMAT_MIME_TYPES[mimeType.trim().toLowerCase()];

  return format ? canonicalInputFormat(format) : null;
}

export interface ValidatedUpload {
  buffer: Buffer;
  originalName: string;
  format: ImageInputFormat;
  size: number;
}

export function validateImageUpload(
  file: File,
  buffer: Buffer,
  maxBytes: number,
  maxSizeMb: number
): ValidatedUpload {
  if (file.size === 0 || buffer.byteLength === 0) {
    throw new ValidationError("The uploaded file is empty.");
  }

  if (file.size > maxBytes || buffer.byteLength > maxBytes) {
    throw new ValidationError(
      `Maximum file size is ${maxSizeMb} MB.`
    );
  }

  const nameFormat = detectFormatFromName(file.name);
  const declaredFormat = detectFormatFromMime(file.type);
  const contentFormat = detectFormatFromBytes(buffer);

  if (!contentFormat) {
    throw new ValidationError(
      "The file content does not match a supported image format."
    );
  }

  if (nameFormat && nameFormat !== contentFormat) {
    throw new ValidationError(
      `The file extension does not match the actual file content (${contentFormat}).`
    );
  }

  if (declaredFormat && declaredFormat !== contentFormat) {
    throw new ValidationError(
      `The declared MIME type does not match the actual file content (${contentFormat}).`
    );
  }

  if (contentFormat === "HEIC" || contentFormat === "HEIF") {
    throw new ValidationError(
      "HEIC and HEIF input requires an additional codec and is not enabled yet."
    );
  }

  return {
    buffer,
    originalName: file.name,
    format: contentFormat,
    size: buffer.byteLength
  };
}
