CREATE TYPE "public"."operator_alert_delivery_state" AS ENUM('claimed', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."operator_incident_severity" AS ENUM('warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."operator_incident_state" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."workspace_export_state" AS ENUM('building', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" DROP CONSTRAINT "workspace_lifecycle_requests_cancel_consistency";--> statement-breakpoint
DROP INDEX "workspace_lifecycle_requests_open_uidx";--> statement-breakpoint
ALTER TYPE "public"."audit_actor_type" RENAME TO "audit_actor_type_previous";--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('human', 'system', 'integration', 'ai_agent', 'operator');--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_type" TYPE "public"."audit_actor_type" USING "actor_type"::text::"public"."audit_actor_type";--> statement-breakpoint
DROP TYPE "public"."audit_actor_type_previous";--> statement-breakpoint
ALTER TYPE "public"."workspace_lifecycle_request_state" RENAME TO "workspace_lifecycle_request_state_previous";--> statement-breakpoint
CREATE TYPE "public"."workspace_lifecycle_request_state" AS ENUM('requested', 'in_review', 'blocked', 'processed', 'canceled');--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ALTER COLUMN "state" TYPE "public"."workspace_lifecycle_request_state" USING "state"::text::"public"."workspace_lifecycle_request_state";--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ALTER COLUMN "state" SET DEFAULT 'requested';--> statement-breakpoint
DROP TYPE "public"."workspace_lifecycle_request_state_previous";--> statement-breakpoint
CREATE TABLE "operator_alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest_key" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"state" "operator_alert_delivery_state" DEFAULT 'claimed' NOT NULL,
	"incident_count" integer NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_alert_deliveries_digest_format" CHECK ("operator_alert_deliveries"."digest_key" ~ '^[0-9a-f]{64}$' and "operator_alert_deliveries"."recipient_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "operator_alert_deliveries_count_positive" CHECK ("operator_alert_deliveries"."incident_count" > 0),
	CONSTRAINT "operator_alert_deliveries_state_consistency" CHECK (("operator_alert_deliveries"."state" = 'claimed' and "operator_alert_deliveries"."sent_at" is null and "operator_alert_deliveries"."error_code" is null) or ("operator_alert_deliveries"."state" = 'sent' and "operator_alert_deliveries"."sent_at" is not null and "operator_alert_deliveries"."error_code" is null) or ("operator_alert_deliveries"."state" = 'failed' and "operator_alert_deliveries"."sent_at" is null and "operator_alert_deliveries"."error_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "operator_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"workspace_id" uuid,
	"signal_type" text NOT NULL,
	"severity" "operator_incident_severity" DEFAULT 'warning' NOT NULL,
	"state" "operator_incident_state" DEFAULT 'open' NOT NULL,
	"safe_error_code" text,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_incidents_fingerprint_format" CHECK ("operator_incidents"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "operator_incidents_signal_length" CHECK (char_length("operator_incidents"."signal_type") between 1 and 80),
	CONSTRAINT "operator_incidents_count_positive" CHECK ("operator_incidents"."occurrence_count" > 0),
	CONSTRAINT "operator_incidents_resolution_consistency" CHECK (("operator_incidents"."state" = 'open' and "operator_incidents"."resolved_at" is null) or ("operator_incidents"."state" = 'resolved' and "operator_incidents"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "workspace_export_parts" (
	"export_id" uuid NOT NULL,
	"part_number" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"artifact" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_export_parts_export_id_part_number_pk" PRIMARY KEY("export_id","part_number"),
	CONSTRAINT "workspace_export_parts_number_positive" CHECK ("workspace_export_parts"."part_number" > 0),
	CONSTRAINT "workspace_export_parts_size_cap" CHECK ("workspace_export_parts"."byte_size" between 1 and 15728639),
	CONSTRAINT "workspace_export_parts_hash_format" CHECK ("workspace_export_parts"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "workspace_export_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"state" "workspace_export_state" DEFAULT 'building' NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"part_count" integer DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"manifest_sha256" text,
	"failure_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_export_runs_format_positive" CHECK ("workspace_export_runs"."format_version" > 0),
	CONSTRAINT "workspace_export_runs_part_count" CHECK ("workspace_export_runs"."part_count" >= 0),
	CONSTRAINT "workspace_export_runs_total_bytes" CHECK ("workspace_export_runs"."total_bytes" >= 0),
	CONSTRAINT "workspace_export_runs_state_consistency" CHECK (("workspace_export_runs"."state" = 'building' and "workspace_export_runs"."completed_at" is null and "workspace_export_runs"."failure_code" is null) or ("workspace_export_runs"."state" = 'ready' and "workspace_export_runs"."completed_at" is not null and "workspace_export_runs"."failure_code" is null and "workspace_export_runs"."manifest_sha256" is not null and "workspace_export_runs"."part_count" > 0) or ("workspace_export_runs"."state" = 'failed' and "workspace_export_runs"."completed_at" is not null and "workspace_export_runs"."failure_code" is not null))
);
--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD COLUMN "operator_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD COLUMN "export_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD COLUMN "blocker_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD COLUMN "review_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operator_incidents" ADD CONSTRAINT "operator_incidents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_export_parts" ADD CONSTRAINT "workspace_export_parts_export_id_workspace_export_runs_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."workspace_export_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_export_runs" ADD CONSTRAINT "workspace_export_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_export_runs" ADD CONSTRAINT "workspace_export_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operator_alert_deliveries_digest_uidx" ON "operator_alert_deliveries" USING btree ("digest_key");--> statement-breakpoint
CREATE INDEX "operator_alert_deliveries_state_claim_idx" ON "operator_alert_deliveries" USING btree ("state","claimed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_incidents_fingerprint_uidx" ON "operator_incidents" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "operator_incidents_state_notify_idx" ON "operator_incidents" USING btree ("state","last_notified_at","last_observed_at","id");--> statement-breakpoint
CREATE INDEX "operator_incidents_workspace_state_idx" ON "operator_incidents" USING btree ("workspace_id","state","last_observed_at");--> statement-breakpoint
CREATE INDEX "workspace_export_parts_export_number_idx" ON "workspace_export_parts" USING btree ("export_id","part_number");--> statement-breakpoint
CREATE INDEX "workspace_export_runs_workspace_created_idx" ON "workspace_export_runs" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "workspace_export_runs_state_expiry_idx" ON "workspace_export_runs" USING btree ("state","expires_at","id");--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_export_id_workspace_export_runs_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."workspace_export_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_checkout_status_updated_idx" ON "billing_checkout_attempts" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "engineering_repositories_state_stale_idx" ON "engineering_repositories" USING btree ("state","stale_at","id");--> statement-breakpoint
CREATE INDEX "managed_usage_state_period_end_idx" ON "managed_usage_records" USING btree ("state","period_ends_at","workspace_id");--> statement-breakpoint
CREATE INDEX "migration_import_sessions_state_lease_idx" ON "migration_import_sessions" USING btree ("state","processing_lease_until","id");--> statement-breakpoint
CREATE INDEX "provider_webhook_deliveries_state_received_idx" ON "provider_webhook_deliveries" USING btree ("state","received_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_lifecycle_requests_open_uidx" ON "workspace_lifecycle_requests" USING btree ("workspace_id") WHERE "workspace_lifecycle_requests"."state" in ('requested', 'in_review', 'blocked');--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_review_consistency" CHECK (("workspace_lifecycle_requests"."state" = 'requested' and "workspace_lifecycle_requests"."review_started_at" is null and "workspace_lifecycle_requests"."operator_id" is null) or ("workspace_lifecycle_requests"."state" <> 'requested' and "workspace_lifecycle_requests"."state" <> 'canceled' and "workspace_lifecycle_requests"."review_started_at" is not null and "workspace_lifecycle_requests"."operator_id" is not null) or ("workspace_lifecycle_requests"."state" = 'canceled'));--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_processed_consistency" CHECK (("workspace_lifecycle_requests"."state" = 'processed' and "workspace_lifecycle_requests"."processed_at" is not null and "workspace_lifecycle_requests"."export_id" is not null and jsonb_array_length("workspace_lifecycle_requests"."blocker_codes") = 0) or ("workspace_lifecycle_requests"."state" <> 'processed' and "workspace_lifecycle_requests"."processed_at" is null));--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_blocker_consistency" CHECK (("workspace_lifecycle_requests"."state" = 'blocked' and jsonb_array_length("workspace_lifecycle_requests"."blocker_codes") > 0) or ("workspace_lifecycle_requests"."state" <> 'blocked'));--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_cancel_consistency" CHECK (("workspace_lifecycle_requests"."state" = 'canceled' and "workspace_lifecycle_requests"."canceled_at" is not null and "workspace_lifecycle_requests"."canceled_by_user_id" is not null) or ("workspace_lifecycle_requests"."state" <> 'canceled' and "workspace_lifecycle_requests"."canceled_at" is null and "workspace_lifecycle_requests"."canceled_by_user_id" is null));
