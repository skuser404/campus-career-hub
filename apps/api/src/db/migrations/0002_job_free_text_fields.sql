ALTER TYPE "job_mode" ADD VALUE IF NOT EXISTS 'not_mentioned';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "company_logo_url" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_from_lpa" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_to_lpa" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "internship_stipend" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "whatsapp_group_link" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "college_reg_link" text;