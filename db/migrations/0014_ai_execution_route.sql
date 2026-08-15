ALTER TABLE "ai_job_attempts" ADD COLUMN "provider_base_url" text DEFAULT 'legacy-unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD COLUMN "execution_config_fingerprint" text DEFAULT 'legacy-unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "provider_base_url" text DEFAULT 'legacy-unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "execution_config_fingerprint" text DEFAULT 'legacy-unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ALTER COLUMN "provider_base_url" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ALTER COLUMN "execution_config_fingerprint" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_jobs" ALTER COLUMN "provider_base_url" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_jobs" ALTER COLUMN "execution_config_fingerprint" DROP DEFAULT;
