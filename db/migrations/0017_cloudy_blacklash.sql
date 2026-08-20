CREATE TYPE "public"."migration_import_state" AS ENUM('preview_ready', 'committing', 'completed', 'completed_with_errors', 'failed');--> statement-breakpoint
CREATE TYPE "public"."migration_object_kind" AS ENUM('project', 'work_item');--> statement-breakpoint
CREATE TYPE "public"."migration_row_outcome" AS ENUM('valid', 'warning', 'blocked', 'created', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."migration_source_kind" AS ENUM('generic_csv', 'jira_csv');--> statement-breakpoint
CREATE TABLE "migration_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"object_kind" "migration_object_kind" DEFAULT 'work_item' NOT NULL,
	"source_project_key" text NOT NULL,
	"source_object_key" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"outcome" "migration_row_outcome" NOT NULL,
	"normalized_data" jsonb NOT NULL,
	"messages" jsonb NOT NULL,
	"target_project_id" uuid,
	"target_work_item_id" uuid,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_import_rows_number_positive" CHECK ("migration_import_rows"."row_number" > 1)
);
--> statement-breakpoint
CREATE TABLE "migration_import_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_kind" "migration_source_kind" NOT NULL,
	"source_namespace" text NOT NULL,
	"source_name" text NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"state" "migration_import_state" DEFAULT 'preview_ready' NOT NULL,
	"mapping" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"unsupported_columns" jsonb NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"warning_rows" integer NOT NULL,
	"blocked_rows" integer NOT NULL,
	"created_projects" integer DEFAULT 0 NOT NULL,
	"created_work_items" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"committed_anything" boolean DEFAULT false NOT NULL,
	"processing_lease_until" timestamp with time zone,
	"last_error_code" text,
	"created_by_user_id" uuid NOT NULL,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_import_sessions_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "migration_import_sessions_namespace_length" CHECK (char_length(btrim("migration_import_sessions"."source_namespace")) between 1 and 160),
	CONSTRAINT "migration_import_sessions_filename_length" CHECK (char_length(btrim("migration_import_sessions"."file_name")) between 1 and 240),
	CONSTRAINT "migration_import_sessions_row_counts" CHECK ("migration_import_sessions"."total_rows" >= 0 and "migration_import_sessions"."valid_rows" >= 0 and "migration_import_sessions"."warning_rows" >= 0 and "migration_import_sessions"."blocked_rows" >= 0 and "migration_import_sessions"."created_projects" >= 0 and "migration_import_sessions"."created_work_items" >= 0 and "migration_import_sessions"."skipped_rows" >= 0 and "migration_import_sessions"."failed_rows" >= 0)
);
--> statement-breakpoint
CREATE TABLE "migration_source_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_kind" "migration_source_kind" NOT NULL,
	"source_namespace" text NOT NULL,
	"identity_key" text NOT NULL,
	"display_name" text,
	"email" text,
	"mapped_user_id" uuid,
	"first_session_id" uuid NOT NULL,
	"last_session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_source_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_kind" "migration_source_kind" NOT NULL,
	"source_namespace" text NOT NULL,
	"object_kind" "migration_object_kind" NOT NULL,
	"source_project_key" text NOT NULL,
	"source_object_key" text NOT NULL,
	"source_url" text,
	"source_fingerprint" text NOT NULL,
	"source_metadata" jsonb NOT NULL,
	"target_project_id" uuid NOT NULL,
	"target_work_item_id" uuid,
	"first_session_id" uuid NOT NULL,
	"last_session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_template_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"project_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"applied_by_user_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_template_applications_version_positive" CHECK ("project_template_applications"."template_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_templates_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "project_templates_name_length" CHECK (char_length(btrim("project_templates"."name")) between 2 and 120),
	CONSTRAINT "project_templates_description_length" CHECK ("project_templates"."description" is null or char_length("project_templates"."description") <= 2000),
	CONSTRAINT "project_templates_version_positive" CHECK ("project_templates"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "migration_import_rows" ADD CONSTRAINT "migration_import_rows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_rows" ADD CONSTRAINT "migration_import_rows_session_workspace_fk" FOREIGN KEY ("session_id","workspace_id") REFERENCES "public"."migration_import_sessions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_rows" ADD CONSTRAINT "migration_import_rows_project_workspace_fk" FOREIGN KEY ("target_project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_rows" ADD CONSTRAINT "migration_import_rows_work_project_fk" FOREIGN KEY ("target_work_item_id","target_project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_sessions" ADD CONSTRAINT "migration_import_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_sessions" ADD CONSTRAINT "migration_import_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_sessions" ADD CONSTRAINT "migration_import_sessions_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_identities" ADD CONSTRAINT "migration_source_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_identities" ADD CONSTRAINT "migration_source_identities_mapped_user_id_users_id_fk" FOREIGN KEY ("mapped_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_identities" ADD CONSTRAINT "migration_source_identities_first_session_workspace_fk" FOREIGN KEY ("first_session_id","workspace_id") REFERENCES "public"."migration_import_sessions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_identities" ADD CONSTRAINT "migration_source_identities_last_session_workspace_fk" FOREIGN KEY ("last_session_id","workspace_id") REFERENCES "public"."migration_import_sessions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_identities" ADD CONSTRAINT "migration_source_identities_workspace_member_fk" FOREIGN KEY ("workspace_id","mapped_user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_objects" ADD CONSTRAINT "migration_source_objects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_objects" ADD CONSTRAINT "migration_source_objects_project_workspace_fk" FOREIGN KEY ("target_project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_objects" ADD CONSTRAINT "migration_source_objects_work_project_fk" FOREIGN KEY ("target_work_item_id","target_project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_objects" ADD CONSTRAINT "migration_source_objects_first_session_workspace_fk" FOREIGN KEY ("first_session_id","workspace_id") REFERENCES "public"."migration_import_sessions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_source_objects" ADD CONSTRAINT "migration_source_objects_last_session_workspace_fk" FOREIGN KEY ("last_session_id","workspace_id") REFERENCES "public"."migration_import_sessions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_applications" ADD CONSTRAINT "project_template_applications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_applications" ADD CONSTRAINT "project_template_applications_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_applications" ADD CONSTRAINT "project_template_applications_template_workspace_fk" FOREIGN KEY ("template_id","workspace_id") REFERENCES "public"."project_templates"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_applications" ADD CONSTRAINT "project_template_applications_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "migration_import_rows_session_row_uidx" ON "migration_import_rows" USING btree ("session_id","row_number");--> statement-breakpoint
CREATE INDEX "migration_import_rows_session_outcome_idx" ON "migration_import_rows" USING btree ("session_id","outcome","row_number");--> statement-breakpoint
CREATE INDEX "migration_import_rows_source_identity_idx" ON "migration_import_rows" USING btree ("workspace_id","source_project_key","source_object_key");--> statement-breakpoint
CREATE INDEX "migration_import_sessions_workspace_created_idx" ON "migration_import_sessions" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "migration_import_sessions_workspace_state_idx" ON "migration_import_sessions" USING btree ("workspace_id","state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "migration_source_identities_identity_uidx" ON "migration_source_identities" USING btree ("workspace_id","source_kind","source_namespace","identity_key");--> statement-breakpoint
CREATE INDEX "migration_source_identities_workspace_mapping_idx" ON "migration_source_identities" USING btree ("workspace_id","mapped_user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "migration_source_objects_identity_uidx" ON "migration_source_objects" USING btree ("workspace_id","source_kind","source_namespace","object_kind","source_project_key","source_object_key");--> statement-breakpoint
CREATE INDEX "migration_source_objects_target_project_idx" ON "migration_source_objects" USING btree ("target_project_id","target_work_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_applications_project_uidx" ON "project_template_applications" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_template_applications_template_version_idx" ON "project_template_applications" USING btree ("template_id","template_version","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_templates_workspace_name_active_uidx" ON "project_templates" USING btree ("workspace_id",lower("name")) WHERE "project_templates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "project_templates_workspace_archived_name_idx" ON "project_templates" USING btree ("workspace_id","archived_at","name");
