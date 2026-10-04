function readPositiveNumber(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readString(value: string | undefined, fallback = ""): string {
  const normalized = value?.trim();

  return normalized ? normalized : fallback;
}

export const env = {
  appName: readString(import.meta.env.PUBLIC_APP_NAME, "DarConverter"),
  databaseUrl: readString(import.meta.env.DATABASE_URL),
  maxFileSizeMb: readPositiveNumber(
    import.meta.env.MAX_FILE_SIZE_MB,
    50
  ),
  publicMaxFileSizeMb: readPositiveNumber(
    import.meta.env.PUBLIC_MAX_FILE_SIZE_MB,
    50
  ),
  tempFileTtlMinutes: readPositiveNumber(
    import.meta.env.TEMP_FILE_TTL_MINUTES,
    30
  ),
  pdf2docxUrl: readString(import.meta.env.PDF2DOCX_URL)
};

export const maxFileSizeBytes = Math.round(
  env.maxFileSizeMb * 1024 * 1024
);
