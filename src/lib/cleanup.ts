import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { and, inArray, lt } from "drizzle-orm";
import { getDatabase } from "../db";
import { conversionJobs } from "../db/schema";
import { env } from "./env";
import { storageDirectory, type StorageKind } from "./storage";

const SCHEDULER_KEY = Symbol.for("darconverter.cleanup.scheduler");
const SWEEP_INTERVAL_MINUTES = 5;
const INITIAL_SWEEP_DELAY_MS = 10_000;
const JOB_GRACE_MINUTES = 60;
const PRESERVED_FILES = new Set([".gitkeep", ".DS_Store"]);
const EXPIRABLE_STATUSES = ["waiting", "processing", "completed"] as const;

export interface CleanupSummary {
  scannedDirectories: number;
  deletedFiles: number;
  expiredJobs: number;
  deletedJobs: number;
  failedItems: number;
}

interface SweepResult {
  deleted: number;
  failed: number;
}

interface SchedulerHost {
  [SCHEDULER_KEY]?: NodeJS.Timeout;
}

async function sweepDirectory(
  kind: StorageKind,
  expiresAtMs: number
): Promise<SweepResult> {
  const directory = storageDirectory(kind);
  const result: SweepResult = { deleted: 0, failed: 0 };

  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (PRESERVED_FILES.has(entry)) {
      continue;
    }

    try {
      const stats = await stat(path.join(directory, entry));

      if (!stats.isFile() || stats.mtimeMs > expiresAtMs) {
        continue;
      }

      await rm(path.join(directory, entry), { force: true });
      result.deleted += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

export async function cleanupExpiredStorage(): Promise<CleanupSummary> {
  const expiresAtMs = Date.now() - env.tempFileTtlMinutes * 60 * 1000;

  const summary: CleanupSummary = {
    scannedDirectories: 0,
    deletedFiles: 0,
    expiredJobs: 0,
    deletedJobs: 0,
    failedItems: 0
  };

  const results = await Promise.all(
    (["input", "output", "temp"] as StorageKind[]).map((kind) =>
      sweepDirectory(kind, expiresAtMs)
    )
  );

  for (const result of results) {
    summary.scannedDirectories += 1;
    summary.deletedFiles += result.deleted;
    summary.failedItems += result.failed;
  }

  return summary;
}

export async function cleanupExpiredJobs(): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    scannedDirectories: 0,
    deletedFiles: 0,
    expiredJobs: 0,
    deletedJobs: 0,
    failedItems: 0
  };

  try {
    const database = getDatabase();
    const now = new Date();
    const deleteThreshold = new Date(
      now.getTime() - JOB_GRACE_MINUTES * 60 * 1000
    );

    const expired = await database
      .update(conversionJobs)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          lt(conversionJobs.expiresAt, now),
          inArray(conversionJobs.status, [...EXPIRABLE_STATUSES])
        )
      )
      .returning({ id: conversionJobs.id });

    summary.expiredJobs = expired.length;

    const removed = await database
      .delete(conversionJobs)
      .where(lt(conversionJobs.expiresAt, deleteThreshold))
      .returning({ id: conversionJobs.id });

    summary.deletedJobs = removed.length;
  } catch (error) {
    summary.failedItems += 1;
    console.error("[cleanup] job cleanup failed:", error);
  }

  return summary;
}

export async function runCleanup(): Promise<CleanupSummary> {
  const storage = await cleanupExpiredStorage();
  const jobs = await cleanupExpiredJobs();

  return {
    scannedDirectories: storage.scannedDirectories,
    deletedFiles: storage.deletedFiles,
    expiredJobs: jobs.expiredJobs,
    deletedJobs: jobs.deletedJobs,
    failedItems: storage.failedItems + jobs.failedItems
  };
}

export function startCleanupScheduler(): void {
  const host = globalThis as unknown as SchedulerHost;

  if (host[SCHEDULER_KEY]) {
    return;
  }

  const sweep = () => {
    void runCleanup().then((summary) => {
      if (
        summary.deletedFiles > 0 ||
        summary.expiredJobs > 0 ||
        summary.deletedJobs > 0 ||
        summary.failedItems > 0
      ) {
        console.log("[cleanup]", summary);
      }
    });
  };

  const timer = setInterval(
    sweep,
    SWEEP_INTERVAL_MINUTES * 60 * 1000
  );

  timer.unref();
  host[SCHEDULER_KEY] = timer;

  const initial = setTimeout(sweep, INITIAL_SWEEP_DELAY_MS);

  initial.unref();
}
