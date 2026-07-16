CREATE TYPE "public"."report_status" AS ENUM('pending', 'published', 'dismissed');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'report_update';--> statement-breakpoint
CREATE TABLE "opportunity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"department_id" uuid,
	"company_name" text,
	"message" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_reports_status_idx" ON "opportunity_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "opportunity_reports_pending_idx" ON "opportunity_reports" USING btree ("created_at" DESC NULLS LAST) WHERE "opportunity_reports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "opportunity_reports_reporter_idx" ON "opportunity_reports" USING btree ("reporter_id");
