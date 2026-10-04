import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type StorageKind = "input" | "output" | "temp";

const STORAGE_ROOT = fileURLToPath(new URL("../../storage", import.meta.url));

const STORED_NAME_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

export function storageRoot(): string {
  return STORAGE_ROOT;
}

export function storageDirectory(kind: StorageKind): string {
  return path.join(STORAGE_ROOT, kind);
}

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all(
    (["input", "output", "temp"] as StorageKind[]).map((kind) =>
      mkdir(storageDirectory(kind), { recursive: true })
    )
  );
}

export function normalizeExtension(extension: string): string {
  const cleaned = extension.trim().toLowerCase().replace(/^\.+/, "");

  return /^[a-z0-9]{1,8}$/.test(cleaned) ? cleaned : "bin";
}

export function createStoredName(extension: string): string {
  return `${randomUUID()}.${normalizeExtension(extension)}`;
}

export function buildStoredRelativePath(
  kind: StorageKind,
  storedName: string
): string {
  if (!STORED_NAME_PATTERN.test(storedName)) {
    throw new Error("Invalid stored file name.");
  }

  return `${kind}/${storedName}`;
}

export function resolveStoredPath(relativePath: string): string {
  const segments = relativePath.split("/");

  if (segments.length !== 2) {
    throw new Error("Invalid stored file path.");
  }

  const [kind, storedName] = segments;

  if (
    (kind !== "input" && kind !== "output" && kind !== "temp") ||
    !STORED_NAME_PATTERN.test(storedName)
  ) {
    throw new Error("Invalid stored file path.");
  }

  const directory = storageDirectory(kind);
  const absolutePath = path.join(directory, storedName);

  if (path.dirname(absolutePath) !== directory) {
    throw new Error("Invalid stored file path.");
  }

  return absolutePath;
}

export interface StoredFile {
  storedName: string;
  relativePath: string;
  absolutePath: string;
  size: number;
}

export async function writeStoredFile(
  kind: StorageKind,
  payload: Uint8Array,
  extension: string
): Promise<StoredFile> {
  await ensureStorageDirectories();

  const storedName = createStoredName(extension);
  const relativePath = buildStoredRelativePath(kind, storedName);
  const absolutePath = resolveStoredPath(relativePath);

  await writeFile(absolutePath, payload);

  return {
    storedName,
    relativePath,
    absolutePath,
    size: payload.byteLength
  };
}

export async function readStoredFile(
  relativePath: string
): Promise<Buffer> {
  return readFile(resolveStoredPath(relativePath));
}

export async function deleteStoredFile(
  relativePath: string | null | undefined
): Promise<void> {
  if (!relativePath) {
    return;
  }

  try {
    await rm(resolveStoredPath(relativePath), { force: true });
  } catch {
    return;
  }
}

export function sanitizeDownloadName(
  value: string,
  fallback = "converted-file"
): string {
  const baseName = path
    .basename(value.replace(/\\/g, "/"))
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return baseName || fallback;
}
