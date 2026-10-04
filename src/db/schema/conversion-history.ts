import {
  bigint,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { conversionJobs } from "./conversion-jobs";
import { users } from "./users";

export const conversionHistory = pgTable(
  "conversion_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => conversionJobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    toolSlug: varchar("tool_slug", { length: 120 }).notNull(),
    inputFormat: varchar("input_format", { length: 16 }).notNull(),
    outputFormat: varchar("output_format", { length: 16 }).notNull(),
    inputSize: bigint("input_size", { mode: "number" }).notNull(),
    outputSize: bigint("output_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index("conversion_history_job_id_idx").on(table.jobId),
    index("conversion_history_user_id_idx").on(table.userId),
    index("conversion_history_created_at_idx").on(table.createdAt)
  ]
);

export type ConversionHistory = typeof conversionHistory.$inferSelect;
export type NewConversionHistory =
  typeof conversionHistory.$inferInsert;
