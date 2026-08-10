CREATE TYPE "public"."client_acceptance_action" AS ENUM('accepted', 'needs_changes');--> statement-breakpoint
CREATE TYPE "public"."client_discussion_target" AS ENUM('request', 'packet', 'acceptance_target');--> statement-breakpoint
CREATE TYPE "public"."client_email_delivery_state" AS ENUM('not_requested', 'pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."client_notification_kind" AS ENUM('request_submitted', 'clarification_needed', 'discussion_added', 'packet_published', 'packet_actioned', 'acceptance_published', 'acceptance_actioned');--> statement-breakpoint
CREATE TYPE "public"."client_packet_action" AS ENUM('approved', 'rejected', 'clarification_requested');--> statement-breakpoint
CREATE TYPE "public"."client_packet_requirement" AS ENUM('informational', 'approval');--> statement-breakpoint
CREATE TYPE "public"."client_participant_role" AS ENUM('collaborator', 'approver');--> statement-breakpoint
CREATE TYPE "public"."client_projection_target" AS ENUM('milestone', 'deliverable');--> statement-breakpoint
CREATE TABLE "client_acceptance_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"acceptance_target_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"action" "client_acceptance_action" NOT NULL,
	"comment" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_acceptance_actions_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_acceptance_actions_comment_length" CHECK ("client_acceptance_actions"."comment" is null or char_length("client_acceptance_actions"."comment") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "client_acceptance_target_packets" (
	"acceptance_target_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"packet_id" uuid NOT NULL,
	CONSTRAINT "client_acceptance_target_packets_acceptance_target_id_packet_id_pk" PRIMARY KEY("acceptance_target_id","packet_id")
);
--> statement-breakpoint
CREATE TABLE "client_acceptance_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"project_item_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"supersedes_target_id" uuid,
	"superseded_at" timestamp with time zone,
	"snapshot_title" text NOT NULL,
	"snapshot_summary" text NOT NULL,
	"snapshot_status" text,
	"snapshot_target_date" date,
	"milestone_source_updated_at" timestamp with time zone,
	"published_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_acceptance_targets_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_acceptance_targets_version_positive" CHECK ("client_acceptance_targets"."version_number" > 0),
	CONSTRAINT "client_acceptance_targets_title_length" CHECK (char_length(btrim("client_acceptance_targets"."snapshot_title")) between 1 and 240),
	CONSTRAINT "client_acceptance_targets_summary_length" CHECK (char_length(btrim("client_acceptance_targets"."snapshot_summary")) between 1 and 5000),
	CONSTRAINT "client_acceptance_targets_status_length" CHECK ("client_acceptance_targets"."snapshot_status" is null or char_length("client_acceptance_targets"."snapshot_status") <= 80),
	CONSTRAINT "client_acceptance_targets_superseded_time" CHECK ("client_acceptance_targets"."superseded_at" is null or "client_acceptance_targets"."superseded_at" >= "client_acceptance_targets"."published_at")
);
--> statement-breakpoint
CREATE TABLE "client_collaboration_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"recipient_participant_id" uuid,
	"kind" "client_notification_kind" NOT NULL,
	"actor_user_id" uuid,
	"actor_participant_id" uuid,
	"request_id" uuid,
	"packet_id" uuid,
	"acceptance_target_id" uuid,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"email_delivery_state" "client_email_delivery_state" DEFAULT 'not_requested' NOT NULL,
	"email_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_email_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_notifications_dedupe_length" CHECK (char_length("client_collaboration_notifications"."dedupe_key") between 1 and 200),
	CONSTRAINT "client_notifications_attempt_count" CHECK ("client_collaboration_notifications"."email_attempt_count" >= 0),
	CONSTRAINT "client_notifications_target" CHECK ("client_collaboration_notifications"."request_id" is not null or "client_collaboration_notifications"."packet_id" is not null or "client_collaboration_notifications"."acceptance_target_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "client_commercial_packet_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"packet_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"action" "client_packet_action" NOT NULL,
	"comment" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_packet_actions_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_packet_actions_comment_length" CHECK ("client_commercial_packet_actions"."comment" is null or char_length("client_commercial_packet_actions"."comment") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "client_commercial_packet_scope_references" (
	"packet_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_item_revision_id" uuid NOT NULL,
	CONSTRAINT "client_commercial_packet_scope_references_packet_id_scope_item_revision_id_pk" PRIMARY KEY("packet_id","scope_item_revision_id")
);
--> statement-breakpoint
CREATE TABLE "client_commercial_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"impact_assessment_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"supersedes_packet_id" uuid,
	"superseded_at" timestamp with time zone,
	"requirement" "client_packet_requirement" NOT NULL,
	"title" text NOT NULL,
	"request_summary" text NOT NULL,
	"treatment_summary" text NOT NULL,
	"scope_summary" text,
	"assumptions" text,
	"schedule_delta_days" integer,
	"target_date" date,
	"monetary_amount" numeric(18, 2),
	"currency_code" text,
	"published_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_packets_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_packets_version_positive" CHECK ("client_commercial_packets"."version_number" > 0),
	CONSTRAINT "client_packets_title_length" CHECK (char_length(btrim("client_commercial_packets"."title")) between 1 and 240),
	CONSTRAINT "client_packets_request_summary_length" CHECK (char_length(btrim("client_commercial_packets"."request_summary")) between 1 and 5000),
	CONSTRAINT "client_packets_treatment_summary_length" CHECK (char_length(btrim("client_commercial_packets"."treatment_summary")) between 1 and 5000),
	CONSTRAINT "client_packets_optional_text_length" CHECK (("client_commercial_packets"."scope_summary" is null or char_length("client_commercial_packets"."scope_summary") <= 5000) and ("client_commercial_packets"."assumptions" is null or char_length("client_commercial_packets"."assumptions") <= 5000)),
	CONSTRAINT "client_packets_money_pair" CHECK (("client_commercial_packets"."monetary_amount" is null and "client_commercial_packets"."currency_code" is null) or ("client_commercial_packets"."monetary_amount" is not null and "client_commercial_packets"."currency_code" ~ '^[A-Z]{3}$')),
	CONSTRAINT "client_packets_superseded_time" CHECK ("client_commercial_packets"."superseded_at" is null or "client_commercial_packets"."superseded_at" >= "client_commercial_packets"."published_at")
);
--> statement-breakpoint
CREATE TABLE "client_discussion_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target" "client_discussion_target" NOT NULL,
	"request_id" uuid,
	"packet_id" uuid,
	"acceptance_target_id" uuid,
	"author_user_id" uuid NOT NULL,
	"author_participant_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_discussion_messages_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_discussion_messages_target_shape" CHECK (("client_discussion_messages"."target" = 'request' and "client_discussion_messages"."request_id" is not null and "client_discussion_messages"."packet_id" is null and "client_discussion_messages"."acceptance_target_id" is null) or ("client_discussion_messages"."target" = 'packet' and "client_discussion_messages"."request_id" is null and "client_discussion_messages"."packet_id" is not null and "client_discussion_messages"."acceptance_target_id" is null) or ("client_discussion_messages"."target" = 'acceptance_target' and "client_discussion_messages"."request_id" is null and "client_discussion_messages"."packet_id" is null and "client_discussion_messages"."acceptance_target_id" is not null)),
	CONSTRAINT "client_discussion_messages_body_length" CHECK (char_length(btrim("client_discussion_messages"."body")) between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "client_project_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "client_participant_role" NOT NULL,
	"state" "invitation_state" DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"accepted_participant_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"email_delivery_state" "client_email_delivery_state" DEFAULT 'not_requested' NOT NULL,
	"email_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_email_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_invitations_email_length" CHECK (char_length(btrim("client_project_invitations"."email")) between 3 and 320),
	CONSTRAINT "client_invitations_attempt_count" CHECK ("client_project_invitations"."email_attempt_count" >= 0),
	CONSTRAINT "client_invitations_lifecycle" CHECK (("client_project_invitations"."state" = 'pending' and "client_project_invitations"."token_hash" is not null and "client_project_invitations"."accepted_participant_id" is null and "client_project_invitations"."accepted_at" is null and "client_project_invitations"."revoked_at" is null) or ("client_project_invitations"."state" = 'accepted' and "client_project_invitations"."token_hash" is null and "client_project_invitations"."accepted_participant_id" is not null and "client_project_invitations"."accepted_at" is not null and "client_project_invitations"."revoked_at" is null) or ("client_project_invitations"."state" = 'revoked' and "client_project_invitations"."token_hash" is null and "client_project_invitations"."accepted_participant_id" is null and "client_project_invitations"."accepted_at" is null and "client_project_invitations"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "client_project_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"target" "client_projection_target" NOT NULL,
	"milestone_id" uuid,
	"scope_item_revision_id" uuid,
	"client_summary" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_project_items_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_project_items_target_shape" CHECK (("client_project_items"."target" = 'milestone' and "client_project_items"."milestone_id" is not null and "client_project_items"."scope_item_revision_id" is null) or ("client_project_items"."target" = 'deliverable' and "client_project_items"."milestone_id" is null and "client_project_items"."scope_item_revision_id" is not null)),
	CONSTRAINT "client_project_items_summary_length" CHECK (char_length(btrim("client_project_items"."client_summary")) between 1 and 2000),
	CONSTRAINT "client_project_items_hidden_time" CHECK ("client_project_items"."hidden_at" is null or "client_project_items"."hidden_at" >= "client_project_items"."visible_at")
);
--> statement-breakpoint
CREATE TABLE "client_project_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"role" "client_participant_role" NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_participants_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "client_participants_email_length" CHECK (char_length(btrim("client_project_participants"."invited_email")) between 3 and 320),
	CONSTRAINT "client_participants_revoked_time" CHECK ("client_project_participants"."revoked_at" is null or "client_project_participants"."revoked_at" >= "client_project_participants"."activated_at")
);
--> statement-breakpoint
CREATE TABLE "client_project_profiles" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_project_profiles_summary_length" CHECK (char_length(btrim("client_project_profiles"."summary")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "commercial_requests" ADD COLUMN "submitted_by_client_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "client_acceptance_actions" ADD CONSTRAINT "client_acceptance_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_actions" ADD CONSTRAINT "client_acceptance_actions_target_project_fk" FOREIGN KEY ("acceptance_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_actions" ADD CONSTRAINT "client_acceptance_actions_participant_project_fk" FOREIGN KEY ("participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_target_packets" ADD CONSTRAINT "client_acceptance_target_packets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_target_packets" ADD CONSTRAINT "client_acceptance_target_packets_target_project_fk" FOREIGN KEY ("acceptance_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_target_packets" ADD CONSTRAINT "client_acceptance_target_packets_packet_project_fk" FOREIGN KEY ("packet_id","project_id") REFERENCES "public"."client_commercial_packets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_targets" ADD CONSTRAINT "client_acceptance_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_targets" ADD CONSTRAINT "client_acceptance_targets_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_targets" ADD CONSTRAINT "client_acceptance_targets_item_project_fk" FOREIGN KEY ("project_item_id","project_id") REFERENCES "public"."client_project_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_acceptance_targets" ADD CONSTRAINT "client_acceptance_targets_supersedes_project_fk" FOREIGN KEY ("supersedes_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_collaboration_notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_collaboration_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_collaboration_notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_notifications_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_notifications_recipient_project_fk" FOREIGN KEY ("recipient_participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_notifications_actor_project_fk" FOREIGN KEY ("actor_participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_notifications_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_notifications_packet_project_fk" FOREIGN KEY ("packet_id","project_id") REFERENCES "public"."client_commercial_packets"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_collaboration_notifications" ADD CONSTRAINT "client_notifications_acceptance_project_fk" FOREIGN KEY ("acceptance_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packet_actions" ADD CONSTRAINT "client_commercial_packet_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packet_actions" ADD CONSTRAINT "client_packet_actions_packet_project_fk" FOREIGN KEY ("packet_id","project_id") REFERENCES "public"."client_commercial_packets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packet_actions" ADD CONSTRAINT "client_packet_actions_participant_project_fk" FOREIGN KEY ("participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packet_scope_references" ADD CONSTRAINT "client_commercial_packet_scope_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packet_scope_references" ADD CONSTRAINT "client_packet_scope_refs_packet_project_fk" FOREIGN KEY ("packet_id","project_id") REFERENCES "public"."client_commercial_packets"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packet_scope_references" ADD CONSTRAINT "client_packet_scope_refs_revision_project_fk" FOREIGN KEY ("scope_item_revision_id","project_id") REFERENCES "public"."commercial_scope_item_revisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packets" ADD CONSTRAINT "client_commercial_packets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packets" ADD CONSTRAINT "client_commercial_packets_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packets" ADD CONSTRAINT "client_packets_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packets" ADD CONSTRAINT "client_packets_decision_project_fk" FOREIGN KEY ("decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packets" ADD CONSTRAINT "client_packets_impact_project_fk" FOREIGN KEY ("impact_assessment_id","project_id") REFERENCES "public"."commercial_impact_assessments"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_commercial_packets" ADD CONSTRAINT "client_packets_supersedes_project_fk" FOREIGN KEY ("supersedes_packet_id","project_id") REFERENCES "public"."client_commercial_packets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_discussion_messages" ADD CONSTRAINT "client_discussion_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_discussion_messages" ADD CONSTRAINT "client_discussion_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_discussion_messages" ADD CONSTRAINT "client_discussion_messages_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_discussion_messages" ADD CONSTRAINT "client_discussion_messages_packet_project_fk" FOREIGN KEY ("packet_id","project_id") REFERENCES "public"."client_commercial_packets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_discussion_messages" ADD CONSTRAINT "client_discussion_messages_acceptance_project_fk" FOREIGN KEY ("acceptance_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_discussion_messages" ADD CONSTRAINT "client_discussion_messages_participant_project_fk" FOREIGN KEY ("author_participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_invitations" ADD CONSTRAINT "client_project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_invitations" ADD CONSTRAINT "client_project_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_invitations" ADD CONSTRAINT "client_invitations_participant_project_fk" FOREIGN KEY ("accepted_participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_items" ADD CONSTRAINT "client_project_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_items" ADD CONSTRAINT "client_project_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_items" ADD CONSTRAINT "client_project_items_milestone_project_fk" FOREIGN KEY ("milestone_id","project_id") REFERENCES "public"."milestones"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_items" ADD CONSTRAINT "client_project_items_revision_project_fk" FOREIGN KEY ("scope_item_revision_id","project_id") REFERENCES "public"."commercial_scope_item_revisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_participants" ADD CONSTRAINT "client_project_participants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_participants" ADD CONSTRAINT "client_project_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_participants" ADD CONSTRAINT "client_project_participants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_profiles" ADD CONSTRAINT "client_project_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_profiles" ADD CONSTRAINT "client_project_profiles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_acceptance_actions_target_uidx" ON "client_acceptance_actions" USING btree ("acceptance_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_acceptance_actions_idempotency_uidx" ON "client_acceptance_actions" USING btree ("acceptance_target_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "client_acceptance_actions_project_acted_idx" ON "client_acceptance_actions" USING btree ("project_id","acted_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_acceptance_targets_item_version_uidx" ON "client_acceptance_targets" USING btree ("project_item_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "client_acceptance_targets_item_idempotency_uidx" ON "client_acceptance_targets" USING btree ("project_item_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_acceptance_targets_supersedes_uidx" ON "client_acceptance_targets" USING btree ("supersedes_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_acceptance_targets_current_item_uidx" ON "client_acceptance_targets" USING btree ("project_item_id") WHERE "client_acceptance_targets"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "client_acceptance_targets_project_published_idx" ON "client_acceptance_targets" USING btree ("project_id","published_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_notifications_recipient_dedupe_uidx" ON "client_collaboration_notifications" USING btree ("recipient_user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "client_notifications_recipient_unread_idx" ON "client_collaboration_notifications" USING btree ("recipient_user_id","read_at","created_at","id");--> statement-breakpoint
CREATE INDEX "client_notifications_project_recipient_idx" ON "client_collaboration_notifications" USING btree ("project_id","recipient_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_packet_actions_packet_uidx" ON "client_commercial_packet_actions" USING btree ("packet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_packet_actions_idempotency_uidx" ON "client_commercial_packet_actions" USING btree ("packet_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "client_packet_actions_project_acted_idx" ON "client_commercial_packet_actions" USING btree ("project_id","acted_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_packets_request_version_uidx" ON "client_commercial_packets" USING btree ("request_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "client_packets_request_idempotency_uidx" ON "client_commercial_packets" USING btree ("request_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_packets_supersedes_uidx" ON "client_commercial_packets" USING btree ("supersedes_packet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_packets_current_request_uidx" ON "client_commercial_packets" USING btree ("request_id") WHERE "client_commercial_packets"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "client_packets_project_published_idx" ON "client_commercial_packets" USING btree ("project_id","published_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_discussion_messages_author_idempotency_uidx" ON "client_discussion_messages" USING btree ("author_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "client_discussion_messages_project_created_idx" ON "client_discussion_messages" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_invitations_token_hash_uidx" ON "client_project_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "client_invitations_project_idempotency_uidx" ON "client_project_invitations" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_invitations_pending_email_uidx" ON "client_project_invitations" USING btree ("project_id",lower("email")) WHERE "client_project_invitations"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "client_invitations_project_state_idx" ON "client_project_invitations" USING btree ("project_id","state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_project_items_project_idempotency_uidx" ON "client_project_items" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_project_items_active_milestone_uidx" ON "client_project_items" USING btree ("project_id","milestone_id") WHERE "client_project_items"."hidden_at" is null and "client_project_items"."milestone_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "client_project_items_active_revision_uidx" ON "client_project_items" USING btree ("project_id","scope_item_revision_id") WHERE "client_project_items"."hidden_at" is null and "client_project_items"."scope_item_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "client_project_items_project_visible_idx" ON "client_project_items" USING btree ("project_id","hidden_at","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_participants_project_user_uidx" ON "client_project_participants" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "client_participants_user_active_idx" ON "client_project_participants" USING btree ("user_id","revoked_at","project_id");--> statement-breakpoint
ALTER TABLE "commercial_requests" ADD CONSTRAINT "commercial_requests_client_participant_project_fk" FOREIGN KEY ("submitted_by_client_participant_id","project_id") REFERENCES "public"."client_project_participants"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_requests_client_participant_idx" ON "commercial_requests" USING btree ("submitted_by_client_participant_id","received_at");