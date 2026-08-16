CREATE TYPE "public"."billing_checkout_status" AS ENUM('creating', 'pending', 'completed', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."billing_event_state" AS ENUM('processing', 'processed', 'ignored', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."billing_subscription_status" AS ENUM('entry', 'checkout_pending', 'active', 'grace', 'canceled_paid_through', 'expired');--> statement-breakpoint
CREATE TYPE "public"."managed_usage_metric" AS ENUM('ai_job_start', 'email_send', 'storage_bytes', 'processing_unit');--> statement-breakpoint
CREATE TYPE "public"."managed_usage_state" AS ENUM('reserved', 'consumed', 'released');--> statement-breakpoint
CREATE TABLE "billing_checkout_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"status" "billing_checkout_status" DEFAULT 'creating' NOT NULL,
	"provider_transaction_id" text,
	"checkout_url" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkout_pending_shape" CHECK (("billing_checkout_attempts"."status" = 'pending' and "billing_checkout_attempts"."provider_transaction_id" is not null and "billing_checkout_attempts"."checkout_url" is not null) or "billing_checkout_attempts"."status" <> 'pending')
);
--> statement-breakpoint
CREATE TABLE "billing_provider_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"workspace_id" uuid,
	"provider_object_id" text,
	"payload_sha256" text NOT NULL,
	"state" "billing_event_state" DEFAULT 'processing' NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "billing_provider_events_processed_consistency" CHECK (("billing_provider_events"."state" = 'processing' and "billing_provider_events"."processed_at" is null) or ("billing_provider_events"."state" <> 'processing' and "billing_provider_events"."processed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "managed_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"metric" "managed_usage_metric" NOT NULL,
	"state" "managed_usage_state" DEFAULT 'reserved' NOT NULL,
	"period_starts_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"units_reserved" integer NOT NULL,
	"units_consumed" integer DEFAULT 0 NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_usage_reserved_positive" CHECK ("managed_usage_records"."units_reserved" > 0),
	CONSTRAINT "managed_usage_consumed_range" CHECK ("managed_usage_records"."units_consumed" >= 0 and "managed_usage_records"."units_consumed" <= "managed_usage_records"."units_reserved"),
	CONSTRAINT "managed_usage_period_order" CHECK ("managed_usage_records"."period_starts_at" < "managed_usage_records"."period_ends_at"),
	CONSTRAINT "managed_usage_settlement_consistency" CHECK (("managed_usage_records"."state" = 'reserved' and "managed_usage_records"."settled_at" is null) or ("managed_usage_records"."state" <> 'reserved' and "managed_usage_records"."settled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "workspace_billing_states" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"provider" text,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"plan_key" text NOT NULL,
	"pending_plan_key" text,
	"status" "billing_subscription_status" DEFAULT 'entry' NOT NULL,
	"effective_entitlements" jsonb NOT NULL,
	"period_starts_at" timestamp with time zone,
	"period_ends_at" timestamp with time zone,
	"paid_through" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_provider_occurred_at" timestamp with time zone,
	"last_provider_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_billing_provider_refs_consistency" CHECK (("workspace_billing_states"."provider" is null and "workspace_billing_states"."provider_customer_id" is null and "workspace_billing_states"."provider_subscription_id" is null) or "workspace_billing_states"."provider" is not null)
);
--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD COLUMN "managed_usage_record_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_checkout_attempts" ADD CONSTRAINT "billing_checkout_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout_attempts" ADD CONSTRAINT "billing_checkout_attempts_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_provider_events" ADD CONSTRAINT "billing_provider_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_usage_records" ADD CONSTRAINT "managed_usage_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_billing_states" ADD CONSTRAINT "workspace_billing_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_workspace_idempotency_uidx" ON "billing_checkout_attempts" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_provider_transaction_uidx" ON "billing_checkout_attempts" USING btree ("provider_transaction_id") WHERE "billing_checkout_attempts"."provider_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "billing_checkout_workspace_status_idx" ON "billing_checkout_attempts" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "billing_provider_events_workspace_occurred_idx" ON "billing_provider_events" USING btree ("workspace_id","occurred_at","event_id");--> statement-breakpoint
CREATE INDEX "billing_provider_events_state_received_idx" ON "billing_provider_events" USING btree ("state","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_usage_workspace_metric_idempotency_uidx" ON "managed_usage_records" USING btree ("workspace_id","metric","idempotency_key");--> statement-breakpoint
CREATE INDEX "managed_usage_workspace_metric_period_idx" ON "managed_usage_records" USING btree ("workspace_id","metric","period_starts_at","state");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_billing_provider_customer_uidx" ON "workspace_billing_states" USING btree ("provider","provider_customer_id") WHERE "workspace_billing_states"."provider_customer_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_billing_provider_subscription_uidx" ON "workspace_billing_states" USING btree ("provider","provider_subscription_id") WHERE "workspace_billing_states"."provider_subscription_id" is not null;--> statement-breakpoint
CREATE INDEX "workspace_billing_status_idx" ON "workspace_billing_states" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_managed_usage_record_id_managed_usage_records_id_fk" FOREIGN KEY ("managed_usage_record_id") REFERENCES "public"."managed_usage_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempts_managed_usage_uidx" ON "ai_job_attempts" USING btree ("managed_usage_record_id") WHERE "ai_job_attempts"."managed_usage_record_id" is not null;