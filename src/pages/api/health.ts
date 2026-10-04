import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { getDatabase } from "../../db";
import { conversionJobs } from "../../db/schema";
import { apiError, apiSuccess } from "../../lib/api";
import { env } from "../../lib/env";

interface DatabaseReport {
  connected: boolean;
  driver: "neon-postgresql";
  migrationsApplied: boolean;
  missingTables: string[];
  serverVersion: string;
  appName: string;
}

interface MigrationReport {
  migrationsApplied: boolean;
  pendingMigrations: string[];
}

const REQUIRED_TABLES = [
  "conversion_files",
  "conversion_history",
  "conversion_jobs",
  "users"
] as const;

/**
 * The database layer runs on raw SQL rather than a migration ORM at runtime, so
 * the check is a cheap catalog probe: the tables the app reads from and writes
 * to have to exist, otherwise conversion would fail on the first insert.
 */
async function readMigrationReport(): Promise<MigrationReport> {
  const database = getDatabase();

  try {
    const result = await database.execute<{ table_name: string }>(sql`
      select table_name
      from information_schema.tables
      where table_schema = current_schema()
        and table_name in (${sql.join(REQUIRED_TABLES.map((name) => sql`${name}`), sql`, `)})
    `);

    const found = new Set(result.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((name) => !found.has(name));

    return {
      migrationsApplied: missing.length === 0,
      pendingMigrations: [...missing]
    };
  } catch (error) {
    console.error("[health] catalog probe failed:", error);

    return {
      migrationsApplied: false,
      pendingMigrations: [...REQUIRED_TABLES]
    };
  }
}

export const GET: APIRoute = async () => {
  if (!env.databaseUrl) {
    return apiError(
      "DATABASE_URL is not configured on this server.",
      503,
      { "X-Database": "missing" }
    );
  }

  try {
    const database = getDatabase();

    const probeResult = await database.execute<{ server_version: string }>(
      sql`select version() as server_version`
    );
    const probe = probeResult.rows[0];

    const migrations = await readMigrationReport();

    await database.select({ id: conversionJobs.id }).from(conversionJobs).limit(1);

    const report: DatabaseReport = {
      connected: true,
      driver: "neon-postgresql",
      migrationsApplied: migrations.migrationsApplied,
      missingTables: migrations.pendingMigrations,
      serverVersion: probe?.server_version ?? "unknown",
      appName: env.appName
    };

    if (!migrations.migrationsApplied) {
      return apiError(
        `Database is reachable but these tables are missing: ${migrations.pendingMigrations.join(", ")}. Run npm run db:migrate.`,
        503,
        {
          "X-Database": "connected",
          "X-Missing-Tables": migrations.pendingMigrations.join(",")
        }
      );
    }

    return apiSuccess(report, 200, {
      "X-Database": "connected"
    });
  } catch (error) {
    console.error("[health] database check failed:", error);

    return apiError("The database cannot be reached.", 503, {
      "X-Database": "unreachable"
    });
  }
};
