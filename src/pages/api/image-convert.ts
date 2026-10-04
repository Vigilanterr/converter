import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { toolMap } from "../../data/tools";
import {
  assertDatabaseReady,
  DatabaseError,
  getDatabase
} from "../../db";
import {
  conversionFiles,
  conversionHistory,
  conversionJobs
} from "../../db/schema";
import { apiError, downloadResponse } from "../../lib/api";
import { startCleanupScheduler } from "../../lib/cleanup";
import { env, maxFileSizeBytes } from "../../lib/env";
import {
  ConversionError,
  convertImage,
  convertImagesToPdf,
  normalizeBackgroundColor,
  normalizeDimension,
  normalizeQuality,
  type ConversionOptions,
  type ConversionSource
} from "../../lib/image-convert";
import {
  deleteStoredFile,
  sanitizeDownloadName,
  writeStoredFile,
  type StoredFile
} from "../../lib/storage";
import { normalizeTraceColors, normalizeTraceMode } from "../../lib/vectorize";
import {
  canonicalOutputFormat,
  ValidationError,
  validateImageUpload,
  type ValidatedUpload
} from "../../lib/validation";

const ROTATIONS = [0, 90, 180, 270] as const;

interface ParsedRequest {
  uploads: ValidatedUpload[];
  options: ConversionOptions;
  toolSlug: string;
}

function parseOptionalNumber(
  value: FormDataEntryValue | null
): number | undefined {
  const raw = value === null ? "" : String(value).trim();

  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveRotation(
  value: FormDataEntryValue | null
): 0 | 90 | 180 | 270 {
  const parsed = Number(value ?? 0);

  return (ROTATIONS as readonly number[]).includes(parsed)
    ? (parsed as 0 | 90 | 180 | 270)
    : 0;
}

function resolveToolSlug(
  requested: FormDataEntryValue | null,
  inputFormat: string,
  outputFormat: string
): string {
  const slug = String(requested ?? "")
    .trim()
    .toLowerCase();

  if (slug && toolMap.has(slug)) {
    return slug;
  }

  return `${inputFormat.toLowerCase()}-to-${outputFormat.toLowerCase()}`;
}

async function readFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ValidationError(
      "The request must be sent as multipart/form-data."
    );
  }
}

async function parseRequest(formData: FormData): Promise<ParsedRequest> {
  const files = formData
    .getAll("file")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    throw new ValidationError("At least one file is required.");
  }

  const outputFormat = canonicalOutputFormat(
    String(formData.get("output") ?? "")
  );

  if (!outputFormat) {
    throw new ValidationError("Unsupported output format.");
  }

  if (outputFormat !== "PDF" && files.length > 1) {
    throw new ValidationError(
      "This converter accepts one file at a time. Select a single file."
    );
  }

  const uploads = await Promise.all(
    files.map(async (file) =>
      validateImageUpload(
        file,
        Buffer.from(await file.arrayBuffer()),
        maxFileSizeBytes,
        env.maxFileSizeMb
      )
    )
  );

  const options: ConversionOptions = {
    outputFormat,
    quality: normalizeQuality(parseOptionalNumber(formData.get("quality")) ?? 85),
    width: normalizeDimension(parseOptionalNumber(formData.get("width"))),
    height: normalizeDimension(parseOptionalNumber(formData.get("height"))),
    background: normalizeBackgroundColor(
      String(formData.get("background") ?? "") || undefined
    ),
    removeMetadata: String(formData.get("keepMetadata") ?? "") !== "true",
    rotation: resolveRotation(formData.get("rotation")),
    ...(outputFormat === "SVG"
      ? {
          trace: {
            mode: normalizeTraceMode(formData.get("traceMode")),
            colors: normalizeTraceColors(parseOptionalNumber(formData.get("traceColors"))),
            detail: parseOptionalNumber(formData.get("traceDetail")),
            smoothing: parseOptionalNumber(formData.get("traceSmoothing")),
            maxTraceEdge: parseOptionalNumber(formData.get("traceMaxEdge"))
          }
        }
      : {})
  };

  return {
    uploads,
    options,
    toolSlug: resolveToolSlug(
      formData.get("tool"),
      uploads[0].format,
      outputFormat
    )
  };
}

function jobExpiryDate(): Date {
  return new Date(Date.now() + env.tempFileTtlMinutes * 60 * 1000);
}

function describeError(error: unknown): string {
  if (error instanceof ValidationError || error instanceof ConversionError) {
    return error.message;
  }

  if (error instanceof DatabaseError) {
    return "The conversion service is temporarily unavailable.";
  }

  return "Image conversion failed due to an unexpected error.";
}

function statusForError(error: unknown): number {
  if (error instanceof ValidationError) {
    return 400;
  }

  if (error instanceof ConversionError) {
    return 422;
  }

  if (error instanceof DatabaseError) {
    return 503;
  }

  return 500;
}

async function markJobAsFailed(id: string, message: string): Promise<void> {
  await getDatabase()
    .update(conversionJobs)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 1000),
      updatedAt: new Date()
    })
    .where(eq(conversionJobs.id, id));
}

async function runConversion(
  uploads: ValidatedUpload[],
  options: ConversionOptions,
  toolSlug: string,
  expiresAt: Date
): Promise<Response> {
  const database = getDatabase();

  const [job] = await database
    .insert(conversionJobs)
    .values({ status: "processing", toolSlug, expiresAt })
    .returning({ id: conversionJobs.id });

  const storedInputs: StoredFile[] = [];
  let storedOutput: StoredFile | null = null;

  try {
    for (const upload of uploads) {
      storedInputs.push(
        await writeStoredFile(
          "input",
          upload.buffer,
          upload.format.toLowerCase()
        )
      );
    }

    const sources: ConversionSource[] = uploads.map((upload) => ({
      buffer: upload.buffer,
      format: upload.format
    }));

    const result =
      options.outputFormat === "PDF"
        ? await convertImagesToPdf(sources, options)
        : await convertImage(sources[0], options);

    storedOutput = await writeStoredFile("output", result.data, result.extension);

    const totalInputSize = uploads.reduce(
      (total, upload) => total + upload.size,
      0
    );

    await database.transaction(async (transaction) => {
      await transaction.insert(conversionFiles).values(
        uploads.map((upload, index) => ({
          jobId: job.id,
          originalName: upload.originalName.slice(0, 255),
          storedName: storedInputs[index].storedName,
          inputFormat: upload.format,
          outputFormat: options.outputFormat,
          inputSize: upload.size,
          outputSize: result.data.byteLength,
          inputPath: storedInputs[index].relativePath,
          outputPath: storedOutput?.relativePath ?? null,
          expiresAt
        }))
      );

      await transaction.insert(conversionHistory).values({
        jobId: job.id,
        toolSlug,
        inputFormat: uploads[0].format,
        outputFormat: options.outputFormat,
        inputSize: totalInputSize,
        outputSize: result.data.byteLength
      });

      await transaction
        .update(conversionJobs)
        .set({
          status: "completed",
          errorMessage: null,
          updatedAt: new Date()
        })
        .where(eq(conversionJobs.id, job.id));
    });

    const downloadBaseName = sanitizeDownloadName(
      uploads.length === 1 ? uploads[0].originalName : "images",
      "converted"
    );

    return downloadResponse(
      result.data,
      `${downloadBaseName}.${result.extension}`,
      result.mimeType,
      {
        "X-Conversion-Job-Id": job.id,
        "X-Conversion-Expires-At": expiresAt.toISOString(),
        "X-Output-Width": String(result.width ?? ""),
        "X-Output-Height": String(result.height ?? ""),
        ...(result.tracePathCount === undefined
          ? {}
          : { "X-Trace-Path-Count": String(result.tracePathCount) }),
        ...(result.traceDownscaled
          ? { "X-Trace-Downscaled": "true" }
          : {})
      }
    );
  } catch (error) {
    await Promise.all([
      ...storedInputs.map((stored) => deleteStoredFile(stored.relativePath)),
      deleteStoredFile(storedOutput?.relativePath)
    ]);

    await markJobAsFailed(job.id, describeError(error)).catch((failure) => {
      console.error("[image-convert] could not persist failure:", failure);
    });

    throw error;
  }
}

export const POST: APIRoute = async ({ request }) => {
  startCleanupScheduler();

  try {
    await assertDatabaseReady();
  } catch (error) {
    console.error("[image-convert] database unavailable:", error);

    return apiError(
      "The conversion service is temporarily unavailable because the database cannot be reached.",
      503
    );
  }

  try {
    const { uploads, options, toolSlug } = await parseRequest(
      await readFormData(request)
    );

    return await runConversion(
      uploads,
      options,
      toolSlug,
      jobExpiryDate()
    );
  } catch (error) {
    return apiError(describeError(error), statusForError(error));
  }
};
