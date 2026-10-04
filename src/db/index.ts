import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { env } from "../lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

export class DatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

let pool: Pool | null = null;
let database: Database | null = null;

/**
 * Neon PostgreSQL. The pool is created once per process and reused. The Neon
 * connection string carries its own `sslmode`, so TLS is negotiated by `pg`
 * from the URL and is never overridden here.
 */
function createPool(): Pool {
  if (!env.databaseUrl) {
    throw new DatabaseError(
      "DATABASE_URL is not configured. Add the Neon connection string to your .env file."
    );
  }

  const created = new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });

  created.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });

  return created;
}

export function getDatabase(): Database {
  if (!database) {
    pool = createPool();
    database = drizzle(pool, { schema });
  }

  return database;
}

export async function assertDatabaseReady(): Promise<void> {
  await getDatabase().execute(sql`select 1 as ready`);
}

export { schema };
