import {
  bigint,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { conversionJobs } from "./conversion-jobs";

export const conversionFiles = pgTable(
  "conversion_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => conversionJobs.id, { onDelete: "cascade" }),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storedName: varchar("stored_name", { length: 255 }).notNull(),
    inputFormat: varchar("input_format", { length: 16 }).notNull(),
    outputFormat: varchar("output_format", { length: 16 }).notNull(),
    inputSize: bigint("input_size", { mode: "number" }).notNull(),
    outputSize: bigint("output_size", { mode: "number" }).notNull(),
    inputPath: varchar("input_path", { length: 512 }),
    outputPath: varchar("output_path", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("conversion_files_job_id_idx").on(table.jobId),
    index("conversion_files_expires_at_idx").on(table.expiresAt)
  ]
);

export type ConversionFile = typeof conversionFiles.$inferSelect;
export type NewConversionFile = typeof conversionFiles.$inferInsert;
