CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."workspace_lifecycle_intent" AS ENUM('closure', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."workspace_lifecycle_request_state" AS ENUM('requested', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."workspace_product_signal_outcome" AS ENUM('completed', 'succeeded', 'failed', 'denied');--> statement-breakpoint
CREATE TABLE "workspace_lifecycle_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"intent" "workspace_lifecycle_intent" NOT NULL,
	"state" "workspace_lifecycle_request_state" DEFAULT 'requested' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"canceled_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_lifecycle_requests_cancel_consistency" CHECK (("workspace_lifecycle_requests"."state" = 'requested' and "workspace_lifecycle_requests"."canceled_at" is null and "workspace_lifecycle_requests"."canceled_by_user_id" is null) or ("workspace_lifecycle_requests"."state" = 'canceled' and "workspace_lifecycle_requests"."canceled_at" is not null and "workspace_lifecycle_requests"."canceled_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "workspace_onboarding_preferences" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_onboarding_preferences_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_product_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"outcome" "workspace_product_signal_outcome" NOT NULL,
	"dimension" text DEFAULT 'none' NOT NULL,
	"subject_id" uuid,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_product_signals_event_length" CHECK (char_length("workspace_product_signals"."event_type") between 1 and 80),
	CONSTRAINT "workspace_product_signals_event_allowlist" CHECK ("workspace_product_signals"."event_type" in ('workspace_created', 'client_created', 'project_created', 'commercial_baseline_created', 'client_invite_created', 'client_action_recorded', 'engineering_connected', 'qa_verification_recorded', 'ai_job_completed', 'migration_import_started', 'migration_import_completed', 'billing_checkout_started', 'billing_subscription_changed', 'onboarding_step_completed', 'email_delivery', 'provider_delivery', 'entitlement_denied')),
	CONSTRAINT "workspace_product_signals_dimension_length" CHECK (char_length("workspace_product_signals"."dimension") between 1 and 80),
	CONSTRAINT "workspace_product_signals_dimension_allowlist" CHECK ("workspace_product_signals"."dimension" in ('none', 'workspace_profile', 'internal_member', 'first_client', 'first_project', 'commercial_baseline', 'client_participant', 'engineering_connection', 'qa_verification', 'ai_provider', 'billing_awareness', 'provider_unavailable', 'provider_rejected', 'configuration', 'capacity', 'lease_expired', 'validation', 'workspace_invitation', 'client_invitation', 'client_notification', 'active', 'checkout_pending', 'canceled_paid_through', 'grace', 'expired', 'entry')),
	CONSTRAINT "workspace_product_signals_count_positive" CHECK ("workspace_product_signals"."occurrence_count" > 0),
	CONSTRAINT "workspace_product_signals_time_order" CHECK ("workspace_product_signals"."first_occurred_at" <= "workspace_product_signals"."last_occurred_at")
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "status" "membership_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "suspended_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN "email_delivery_state" "client_email_delivery_state" DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN "email_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN "last_email_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN "last_email_error_code" text;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_lifecycle_requests" ADD CONSTRAINT "workspace_lifecycle_requests_canceled_by_user_id_users_id_fk" FOREIGN KEY ("canceled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_onboarding_preferences" ADD CONSTRAINT "workspace_onboarding_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_onboarding_preferences" ADD CONSTRAINT "workspace_onboarding_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_product_signals" ADD CONSTRAINT "workspace_product_signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_lifecycle_requests_open_uidx" ON "workspace_lifecycle_requests" USING btree ("workspace_id") WHERE "workspace_lifecycle_requests"."state" = 'requested';--> statement-breakpoint
CREATE INDEX "workspace_lifecycle_requests_state_updated_idx" ON "workspace_lifecycle_requests" USING btree ("state","updated_at","workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_onboarding_preferences_user_idx" ON "workspace_onboarding_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_product_signals_identity_uidx" ON "workspace_product_signals" USING btree ("workspace_id","event_type","outcome","dimension");--> statement-breakpoint
CREATE INDEX "workspace_product_signals_event_last_idx" ON "workspace_product_signals" USING btree ("event_type","last_occurred_at","workspace_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_suspended_by_user_id_users_id_fk" FOREIGN KEY ("suspended_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_workspace_status_role_idx" ON "memberships" USING btree ("workspace_id","status","role","created_at");--> statement-breakpoint
CREATE INDEX "workspace_invitations_workspace_state_expiry_idx" ON "workspace_invitations" USING btree ("workspace_id","state","expires_at","id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_suspension_consistency" CHECK (("memberships"."status" = 'active' and "memberships"."suspended_at" is null and "memberships"."suspended_by_user_id" is null) or ("memberships"."status" = 'suspended' and "memberships"."suspended_at" is not null and "memberships"."suspended_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_attempt_count" CHECK ("workspace_invitations"."email_attempt_count" >= 0);
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_error_code_length" CHECK ("workspace_invitations"."last_email_error_code" is null or char_length("workspace_invitations"."last_email_error_code") between 1 and 80);
--> statement-breakpoint
INSERT INTO "workspace_product_signals" (
	"workspace_id", "event_type", "outcome", "dimension", "subject_id",
	"occurrence_count", "first_occurred_at", "last_occurred_at"
)
SELECT
	"workspace_id",
	CASE "event_type"
		WHEN 'workspace.created.v1' THEN 'workspace_created'
		WHEN 'client.created.v1' THEN 'client_created'
		WHEN 'project.created.v1' THEN 'project_created'
		WHEN 'commercial.baseline.created.v1' THEN 'commercial_baseline_created'
		WHEN 'client.invitation.created.v1' THEN 'client_invite_created'
		WHEN 'engineering.repository.connected.v1' THEN 'engineering_connected'
		WHEN 'engineering.verification.recorded.v1' THEN 'qa_verification_recorded'
		WHEN 'migration_import.preview_created.v1' THEN 'migration_import_started'
		WHEN 'migration_import.completed.v1' THEN 'migration_import_completed'
		WHEN 'billing.checkout.created.v1' THEN 'billing_checkout_started'
	END,
	'completed'::"workspace_product_signal_outcome",
	'none',
	(array_agg("target_id" ORDER BY "occurred_at", "id"))[1],
	count(*)::integer,
	min("occurred_at"),
	max("occurred_at")
FROM "audit_events"
WHERE "event_type" IN (
	'workspace.created.v1',
	'client.created.v1',
	'project.created.v1',
	'commercial.baseline.created.v1',
	'client.invitation.created.v1',
	'engineering.repository.connected.v1',
	'engineering.verification.recorded.v1',
	'migration_import.preview_created.v1',
	'migration_import.completed.v1',
	'billing.checkout.created.v1'
)
GROUP BY "workspace_id", "event_type"
ON CONFLICT ("workspace_id", "event_type", "outcome", "dimension") DO NOTHING;
