CREATE TYPE "public"."ai_action_record_type" AS ENUM('work_item', 'clarification');--> statement-breakpoint
CREATE TYPE "public"."ai_attempt_status" AS ENUM('running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."ai_clarification_status" AS ENUM('draft', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."ai_job_kind" AS ENUM('scope_change_analysis', 'delivery_risk_brief', 'work_context_qa_pack');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "ai_action_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"confirmed_by_user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"selection" jsonb NOT NULL,
	"context_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_action_executions_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "ai_action_records" (
	"execution_id" uuid NOT NULL,
	"candidate_key" text NOT NULL,
	"record_type" "ai_action_record_type" NOT NULL,
	"record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_action_records_execution_id_candidate_key_pk" PRIMARY KEY("execution_id","candidate_key")
);
--> statement-breakpoint
CREATE TABLE "ai_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "ai_attempt_status" DEFAULT 'running' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"provider_request_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"duration_ms" integer,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_job_attempts_number_positive" CHECK ("ai_job_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"kind" "ai_job_kind" NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_id" uuid,
	"milestone_id" uuid,
	"work_item_id" uuid,
	"prompt_version" text NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"evidence_map" jsonb NOT NULL,
	"context_fingerprint" text NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_jobs_target_shape" CHECK (("ai_jobs"."kind" = 'scope_change_analysis' and "ai_jobs"."request_id" is not null and "ai_jobs"."milestone_id" is null and "ai_jobs"."work_item_id" is null) or ("ai_jobs"."kind" = 'delivery_risk_brief' and "ai_jobs"."request_id" is null and "ai_jobs"."work_item_id" is null) or ("ai_jobs"."kind" = 'work_context_qa_pack' and "ai_jobs"."request_id" is null and "ai_jobs"."milestone_id" is null and "ai_jobs"."work_item_id" is not null)),
	CONSTRAINT "ai_jobs_lease_consistency" CHECK (("ai_jobs"."status" = 'running' and "ai_jobs"."lease_owner" is not null and "ai_jobs"."lease_expires_at" is not null) or ("ai_jobs"."status" <> 'running' and "ai_jobs"."lease_owner" is null and "ai_jobs"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "commercial_request_clarifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"question" text NOT NULL,
	"status" "ai_clarification_status" DEFAULT 'draft' NOT NULL,
	"originating_job_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_request_clarifications_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_request_clarifications_question_length" CHECK (char_length(btrim("commercial_request_clarifications"."question")) between 1 and 2000),
	CONSTRAINT "commercial_request_clarifications_resolution_consistency" CHECK (("commercial_request_clarifications"."status" = 'draft' and "commercial_request_clarifications"."resolved_at" is null and "commercial_request_clarifications"."resolved_by_user_id" is null) or ("commercial_request_clarifications"."status" <> 'draft' and "commercial_request_clarifications"."resolved_at" is not null and "commercial_request_clarifications"."resolved_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_action_executions" ADD CONSTRAINT "ai_action_executions_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_executions" ADD CONSTRAINT "ai_action_executions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_executions" ADD CONSTRAINT "ai_action_executions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_executions" ADD CONSTRAINT "ai_action_executions_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_records" ADD CONSTRAINT "ai_action_records_execution_id_ai_action_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_action_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_milestone_project_fk" FOREIGN KEY ("milestone_id","project_id") REFERENCES "public"."milestones"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_work_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_clarifications" ADD CONSTRAINT "commercial_request_clarifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_clarifications" ADD CONSTRAINT "commercial_request_clarifications_originating_job_id_ai_jobs_id_fk" FOREIGN KEY ("originating_job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_clarifications" ADD CONSTRAINT "commercial_request_clarifications_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_clarifications" ADD CONSTRAINT "commercial_request_clarifications_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_clarifications" ADD CONSTRAINT "commercial_request_clarifications_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_action_executions_job_idempotency_uidx" ON "ai_action_executions" USING btree ("job_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_action_executions_project_created_idx" ON "ai_action_executions" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_action_records_record_idx" ON "ai_action_records" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempts_job_number_uidx" ON "ai_job_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "ai_job_attempts_job_started_idx" ON "ai_job_attempts" USING btree ("job_id","started_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_project_creator_idempotency_uidx" ON "ai_jobs" USING btree ("project_id","created_by_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_jobs_project_created_idx" ON "ai_jobs" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_lease_idx" ON "ai_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "commercial_request_clarifications_request_status_idx" ON "commercial_request_clarifications" USING btree ("request_id","status","created_at","id");