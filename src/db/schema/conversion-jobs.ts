import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const conversionJobStatuses = [
  "waiting",
  "processing",
  "completed",
  "failed",
  "expired"
] as const;

export type ConversionJobStatus =
  (typeof conversionJobStatuses)[number];

export const conversionJobStatusEnum = pgEnum(
  "conversion_job_status",
  conversionJobStatuses
);

export const conversionJobs = pgTable(
  "conversion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: conversionJobStatusEnum("status")
      .notNull()
      .default("waiting"),
    toolSlug: varchar("tool_slug", { length: 120 }).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("conversion_jobs_status_idx").on(table.status),
    index("conversion_jobs_expires_at_idx").on(table.expiresAt),
    index("conversion_jobs_tool_slug_idx").on(table.toolSlug)
  ]
);

export type ConversionJob = typeof conversionJobs.$inferSelect;
export type NewConversionJob = typeof conversionJobs.$inferInsert;
