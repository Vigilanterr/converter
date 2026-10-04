CREATE TYPE "public"."conversion_job_status" AS ENUM('waiting', 'processing', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "conversion_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"stored_name" varchar(255) NOT NULL,
	"input_format" varchar(16) NOT NULL,
	"output_format" varchar(16) NOT NULL,
	"input_size" bigint NOT NULL,
	"output_size" bigint NOT NULL,
	"input_path" varchar(512),
	"output_path" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid,
	"tool_slug" varchar(120) NOT NULL,
	"input_format" varchar(16) NOT NULL,
	"output_format" varchar(16) NOT NULL,
	"input_size" bigint NOT NULL,
	"output_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "conversion_job_status" DEFAULT 'waiting' NOT NULL,
	"tool_slug" varchar(120) NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "conversion_files" ADD CONSTRAINT "conversion_files_job_id_conversion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."conversion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_history" ADD CONSTRAINT "conversion_history_job_id_conversion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."conversion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_history" ADD CONSTRAINT "conversion_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversion_files_job_id_idx" ON "conversion_files" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "conversion_files_expires_at_idx" ON "conversion_files" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "conversion_history_job_id_idx" ON "conversion_history" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "conversion_history_user_id_idx" ON "conversion_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversion_history_created_at_idx" ON "conversion_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversion_jobs_status_idx" ON "conversion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversion_jobs_expires_at_idx" ON "conversion_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "conversion_jobs_tool_slug_idx" ON "conversion_jobs" USING btree ("tool_slug");