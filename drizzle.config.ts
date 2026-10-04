import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv();

/**
 * Neon PostgreSQL. The connection string always comes from DATABASE_URL in the
 * environment — there is deliberately no fallback URL here, so a missing
 * variable fails loudly instead of silently pointing at a local database that
 * does not hold the real data.
 */
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and paste the Neon connection string."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl
  },
  strict: true,
  verbose: true
});
