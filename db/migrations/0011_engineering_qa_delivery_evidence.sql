CREATE TYPE "public"."defect_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."defect_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."engineering_connection_state" AS ENUM('active', 'disconnected', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."engineering_provider" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."implementation_artifact_kind" AS ENUM('pull_request');--> statement-breakpoint
CREATE TYPE "public"."implementation_artifact_state" AS ENUM('open', 'draft', 'closed', 'merged');--> statement-breakpoint
CREATE TYPE "public"."implementation_check_rollup" AS ENUM('pending', 'passing', 'failing', 'unknown'); -- NOSONAR: generated Drizzle enum definition.--> statement-breakpoint
CREATE TYPE "public"."implementation_link_provenance" AS ENUM('manual', 'provider_key');--> statement-breakpoint
CREATE TYPE "public"."implementation_review_rollup" AS ENUM('pending', 'approved', 'changes_requested', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."provider_delivery_state" AS ENUM('processing', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('manual', 'automated_reference');--> statement-breakpoint
CREATE TYPE "public"."verification_result" AS ENUM('pending', 'passed', 'failed', 'blocked');--> statement-breakpoint
CREATE TABLE "defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "defect_status" DEFAULT 'open' NOT NULL,
	"severity" "defect_severity" NOT NULL,
	"work_item_id" uuid,
	"scope_item_revision_id" uuid,
	"commercial_request_id" uuid,
	"commercial_decision_id" uuid,
	"artifact_id" uuid,
	"verification_id" uuid,
	"milestone_id" uuid,
	"acceptance_target_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "defects_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "defects_number_positive" CHECK ("defects"."number" > 0),
	CONSTRAINT "defects_title_length" CHECK (char_length(btrim("defects"."title")) between 1 and 240),
	CONSTRAINT "defects_description_length" CHECK ("defects"."description" is null or char_length("defects"."description") <= 10000),
	CONSTRAINT "defects_resolution_consistency" CHECK (("defects"."status" = 'open' and "defects"."resolved_at" is null and "defects"."resolved_by_user_id" is null) or ("defects"."status" = 'resolved' and "defects"."resolved_at" is not null and "defects"."resolved_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "engineering_provider_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "engineering_provider" NOT NULL,
	"provider_installation_id" text NOT NULL,
	"account_id" text NOT NULL,
	"account_login" text NOT NULL,
	"state" "engineering_connection_state" DEFAULT 'active' NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"disconnected_by_user_id" uuid,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engineering_installations_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "engineering_installations_disconnect_consistency" CHECK (("engineering_provider_installations"."state" = 'active' and "engineering_provider_installations"."disconnected_at" is null and "engineering_provider_installations"."disconnected_by_user_id" is null) or ("engineering_provider_installations"."state" <> 'active' and "engineering_provider_installations"."disconnected_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "engineering_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"provider" "engineering_provider" NOT NULL,
	"provider_repository_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"url" text NOT NULL,
	"default_branch" text NOT NULL,
	"private" boolean NOT NULL,
	"state" "engineering_connection_state" DEFAULT 'active' NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"last_synced_at" timestamp with time zone,
	"stale_at" timestamp with time zone,
	"last_sync_error_code" text,
	"disconnected_by_user_id" uuid,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engineering_repositories_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "engineering_repositories_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "engineering_repositories_disconnect_consistency" CHECK (("engineering_repositories"."state" = 'active' and "engineering_repositories"."disconnected_at" is null and "engineering_repositories"."disconnected_by_user_id" is null) or ("engineering_repositories"."state" <> 'active' and "engineering_repositories"."disconnected_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "implementation_artifact_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"state" "implementation_artifact_state" NOT NULL,
	"head_sha" text,
	"review_rollup" "implementation_review_rollup" NOT NULL,
	"approvals_count" integer NOT NULL,
	"changes_requested_count" integer NOT NULL,
	"check_rollup" "implementation_check_rollup" NOT NULL,
	"merged_at" timestamp with time zone,
	"merge_commit_sha" text,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "implementation_snapshots_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "implementation_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"provider" "engineering_provider" NOT NULL,
	"kind" "implementation_artifact_kind" NOT NULL,
	"provider_artifact_id" text NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"state" "implementation_artifact_state" NOT NULL,
	"head_ref" text,
	"head_sha" text,
	"base_branch" text NOT NULL,
	"author_ref" text,
	"review_rollup" "implementation_review_rollup" NOT NULL,
	"approvals_count" integer DEFAULT 0 NOT NULL,
	"changes_requested_count" integer DEFAULT 0 NOT NULL,
	"check_rollup" "implementation_check_rollup" NOT NULL,
	"merged_at" timestamp with time zone,
	"merge_commit_sha" text,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stale_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "implementation_artifacts_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "implementation_artifacts_number_positive" CHECK ("implementation_artifacts"."number" > 0),
	CONSTRAINT "implementation_artifacts_review_counts_nonnegative" CHECK ("implementation_artifacts"."approvals_count" >= 0 and "implementation_artifacts"."changes_requested_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "engineering_provider" NOT NULL,
	"delivery_id" text NOT NULL,
	"event_name" text NOT NULL,
	"repository_id" uuid,
	"state" "provider_delivery_state" DEFAULT 'processing' NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "provider_webhook_deliveries_processed_consistency" CHECK (("provider_webhook_deliveries"."state" = 'processing' and "provider_webhook_deliveries"."processed_at" is null) or ("provider_webhook_deliveries"."state" <> 'processing' and "provider_webhook_deliveries"."processed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid,
	"scope_item_revision_id" uuid,
	"artifact_id" uuid,
	"milestone_id" uuid,
	"acceptance_target_id" uuid,
	"method" "verification_method" NOT NULL,
	"category" text NOT NULL,
	"result" "verification_result" NOT NULL,
	"reference_url" text,
	"notes" text,
	"subject_fingerprint" text,
	"artifact_head_sha" text,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_records_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "verification_records_target_required" CHECK (num_nonnulls("verification_records"."work_item_id", "verification_records"."scope_item_revision_id", "verification_records"."artifact_id", "verification_records"."milestone_id", "verification_records"."acceptance_target_id") > 0),
	CONSTRAINT "verification_records_category_length" CHECK (char_length(btrim("verification_records"."category")) between 1 and 80),
	CONSTRAINT "verification_records_notes_length" CHECK ("verification_records"."notes" is null or char_length("verification_records"."notes") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "work_implementation_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"provenance" "implementation_link_provenance" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by_user_id" uuid,
	"removed_at" timestamp with time zone,
	CONSTRAINT "work_implementation_links_actor_consistency" CHECK (("work_implementation_links"."provenance" = 'manual' and "work_implementation_links"."created_by_user_id" is not null) or "work_implementation_links"."provenance" = 'provider_key'),
	CONSTRAINT "work_implementation_links_removed_consistency" CHECK (("work_implementation_links"."removed_at" is null and "work_implementation_links"."removed_by_user_id" is null) or ("work_implementation_links"."removed_at" is not null and "work_implementation_links"."removed_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_defect_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_work_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_scope_revision_project_fk" FOREIGN KEY ("scope_item_revision_id","project_id") REFERENCES "public"."commercial_scope_item_revisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_request_project_fk" FOREIGN KEY ("commercial_request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_decision_project_fk" FOREIGN KEY ("commercial_decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_artifact_project_fk" FOREIGN KEY ("artifact_id","project_id") REFERENCES "public"."implementation_artifacts"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_verification_project_fk" FOREIGN KEY ("verification_id","project_id") REFERENCES "public"."verification_records"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_milestone_project_fk" FOREIGN KEY ("milestone_id","project_id") REFERENCES "public"."milestones"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_acceptance_project_fk" FOREIGN KEY ("acceptance_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_provider_installations" ADD CONSTRAINT "engineering_provider_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_provider_installations" ADD CONSTRAINT "engineering_provider_installations_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_provider_installations" ADD CONSTRAINT "engineering_provider_installations_disconnected_by_user_id_users_id_fk" FOREIGN KEY ("disconnected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_repositories" ADD CONSTRAINT "engineering_repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_repositories" ADD CONSTRAINT "engineering_repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_repositories" ADD CONSTRAINT "engineering_repositories_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_repositories" ADD CONSTRAINT "engineering_repositories_disconnected_by_user_id_users_id_fk" FOREIGN KEY ("disconnected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_repositories" ADD CONSTRAINT "engineering_repositories_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_repositories" ADD CONSTRAINT "engineering_repositories_installation_workspace_fk" FOREIGN KEY ("installation_id","workspace_id") REFERENCES "public"."engineering_provider_installations"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_artifact_snapshots" ADD CONSTRAINT "implementation_artifact_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_artifact_snapshots" ADD CONSTRAINT "implementation_snapshots_artifact_project_fk" FOREIGN KEY ("artifact_id","project_id") REFERENCES "public"."implementation_artifacts"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_artifacts" ADD CONSTRAINT "implementation_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_artifacts" ADD CONSTRAINT "implementation_artifacts_repository_project_fk" FOREIGN KEY ("repository_id","project_id") REFERENCES "public"."engineering_repositories"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_deliveries" ADD CONSTRAINT "provider_webhook_deliveries_repository_id_engineering_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."engineering_repositories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_work_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_scope_revision_project_fk" FOREIGN KEY ("scope_item_revision_id","project_id") REFERENCES "public"."commercial_scope_item_revisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_artifact_project_fk" FOREIGN KEY ("artifact_id","project_id") REFERENCES "public"."implementation_artifacts"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_milestone_project_fk" FOREIGN KEY ("milestone_id","project_id") REFERENCES "public"."milestones"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_acceptance_project_fk" FOREIGN KEY ("acceptance_target_id","project_id") REFERENCES "public"."client_acceptance_targets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_implementation_links" ADD CONSTRAINT "work_implementation_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_implementation_links" ADD CONSTRAINT "work_implementation_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_implementation_links" ADD CONSTRAINT "work_implementation_links_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_implementation_links" ADD CONSTRAINT "work_implementation_links_work_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_implementation_links" ADD CONSTRAINT "work_implementation_links_artifact_project_fk" FOREIGN KEY ("artifact_id","project_id") REFERENCES "public"."implementation_artifacts"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "defects_project_number_uidx" ON "defects" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "defects_project_status_detected_idx" ON "defects" USING btree ("project_id","status","detected_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "engineering_installations_provider_identity_uidx" ON "engineering_provider_installations" USING btree ("provider","provider_installation_id");--> statement-breakpoint
CREATE INDEX "engineering_installations_workspace_state_idx" ON "engineering_provider_installations" USING btree ("workspace_id","state","id");--> statement-breakpoint
CREATE UNIQUE INDEX "engineering_repositories_project_provider_uidx" ON "engineering_repositories" USING btree ("project_id","provider","provider_repository_id");--> statement-breakpoint
CREATE INDEX "engineering_repositories_workspace_provider_idx" ON "engineering_repositories" USING btree ("workspace_id","provider","provider_repository_id");--> statement-breakpoint
CREATE INDEX "engineering_repositories_project_state_idx" ON "engineering_repositories" USING btree ("project_id","state","id");--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_snapshots_artifact_fingerprint_uidx" ON "implementation_artifact_snapshots" USING btree ("artifact_id","fingerprint");--> statement-breakpoint
CREATE INDEX "implementation_snapshots_artifact_captured_idx" ON "implementation_artifact_snapshots" USING btree ("artifact_id","captured_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_artifacts_repository_provider_uidx" ON "implementation_artifacts" USING btree ("repository_id","provider_artifact_id");--> statement-breakpoint
CREATE INDEX "implementation_artifacts_project_updated_idx" ON "implementation_artifacts" USING btree ("project_id","provider_updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_deliveries_identity_uidx" ON "provider_webhook_deliveries" USING btree ("provider","delivery_id");--> statement-breakpoint
CREATE INDEX "provider_webhook_deliveries_received_idx" ON "provider_webhook_deliveries" USING btree ("provider","received_at","id");--> statement-breakpoint
CREATE INDEX "verification_records_project_recorded_idx" ON "verification_records" USING btree ("project_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "verification_records_work_recorded_idx" ON "verification_records" USING btree ("work_item_id","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_implementation_links_pair_uidx" ON "work_implementation_links" USING btree ("work_item_id","artifact_id");--> statement-breakpoint
CREATE INDEX "work_implementation_links_project_artifact_idx" ON "work_implementation_links" USING btree ("project_id","artifact_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_next_defect_positive" CHECK ("projects"."next_defect_number" > 0);
--> statement-breakpoint
CREATE FUNCTION prevent_implementation_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'implementation_artifact_snapshots are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER implementation_artifact_snapshots_immutable
BEFORE UPDATE OR DELETE ON implementation_artifact_snapshots
FOR EACH ROW
EXECUTE FUNCTION prevent_implementation_snapshot_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_verification_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'verification_records are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER verification_records_immutable
BEFORE UPDATE OR DELETE ON verification_records
FOR EACH ROW
EXECUTE FUNCTION prevent_verification_record_mutation();
