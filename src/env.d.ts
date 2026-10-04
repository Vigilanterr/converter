/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly MAX_FILE_SIZE_MB?: string;
  readonly TEMP_FILE_TTL_MINUTES?: string;
  readonly PDF2DOCX_URL?: string;
  readonly PUBLIC_APP_NAME?: string;
  readonly PUBLIC_MAX_FILE_SIZE_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
