CREATE TYPE "public"."commercial_basis_type" AS ENUM('baseline_scope_item');--> statement-breakpoint
CREATE TYPE "public"."commercial_parse_state" AS ENUM('ready', 'needs_ocr', 'failed');--> statement-breakpoint -- NOSONAR: generated DDL must repeat the enum name in its column references
CREATE TYPE "public"."commercial_scope_kind" AS ENUM('deliverable', 'requirement', 'exclusion', 'constraint');--> statement-breakpoint
CREATE TYPE "public"."commercial_source_kind" AS ENUM('pasted_text', 'pdf', 'docx');--> statement-breakpoint
CREATE TYPE "public"."work_purpose" AS ENUM('unclassified', 'client_delivery', 'delivery_support', 'internal');--> statement-breakpoint
CREATE TABLE "commercial_baseline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"baseline_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_baseline_versions_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_baseline_versions_number_positive" CHECK ("commercial_baseline_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "commercial_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_baselines_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_basis_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"basis_type" "commercial_basis_type" NOT NULL,
	"scope_item_revision_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_basis_links_target" CHECK ("commercial_basis_links"."basis_type" = 'baseline_scope_item' and "commercial_basis_links"."scope_item_revision_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "commercial_evidence_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"label" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_evidence_anchors_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_evidence_anchors_offsets" CHECK ("commercial_evidence_anchors"."start_offset" >= 0 and "commercial_evidence_anchors"."end_offset" > "commercial_evidence_anchors"."start_offset" and "commercial_evidence_anchors"."end_offset" <= 500000),
	CONSTRAINT "commercial_evidence_anchors_label_length" CHECK ("commercial_evidence_anchors"."label" is null or char_length("commercial_evidence_anchors"."label") <= 120)
);
--> statement-breakpoint
CREATE TABLE "commercial_evidence_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"kind" "commercial_source_kind" NOT NULL,
	"name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content_sha256" text NOT NULL,
	"original_content" "bytea" NOT NULL,
	"extracted_text" text,
	"parse_state" "commercial_parse_state" NOT NULL,
	"parse_error_code" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_sources_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_sources_name_length" CHECK (char_length(btrim("commercial_evidence_sources"."name")) between 1 and 160),
	CONSTRAINT "commercial_sources_byte_size" CHECK ("commercial_evidence_sources"."byte_size" between 1 and 5242880),
	CONSTRAINT "commercial_sources_hash_format" CHECK ("commercial_evidence_sources"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "commercial_sources_parse_state" CHECK (("commercial_evidence_sources"."parse_state" = 'ready' and "commercial_evidence_sources"."extracted_text" is not null and char_length("commercial_evidence_sources"."extracted_text") between 1 and 500000 and "commercial_evidence_sources"."parse_error_code" is null) or ("commercial_evidence_sources"."parse_state" <> 'ready' and "commercial_evidence_sources"."extracted_text" is null and "commercial_evidence_sources"."parse_error_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "commercial_scope_item_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_item_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"kind" "commercial_scope_kind" NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_scope_revisions_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_scope_revisions_number_positive" CHECK ("commercial_scope_item_revisions"."revision_number" > 0),
	CONSTRAINT "commercial_scope_revisions_title_length" CHECK (char_length(btrim("commercial_scope_item_revisions"."title")) between 1 and 240),
	CONSTRAINT "commercial_scope_revisions_details_length" CHECK ("commercial_scope_item_revisions"."details" is null or char_length("commercial_scope_item_revisions"."details") <= 10000)
);
--> statement-breakpoint
CREATE TABLE "commercial_scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"baseline_version_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_scope_items_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_scope_revision_anchors" (
	"project_id" uuid NOT NULL,
	"scope_item_revision_id" uuid NOT NULL,
	"evidence_anchor_id" uuid NOT NULL,
	CONSTRAINT "commercial_scope_revision_anchors_scope_item_revision_id_evidence_anchor_id_pk" PRIMARY KEY("scope_item_revision_id","evidence_anchor_id")
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "purpose" "work_purpose" DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_baseline_project_fk" FOREIGN KEY ("baseline_id","project_id") REFERENCES "public"."commercial_baselines"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_source_project_fk" FOREIGN KEY ("source_id","project_id") REFERENCES "public"."commercial_evidence_sources"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baselines" ADD CONSTRAINT "commercial_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baselines" ADD CONSTRAINT "commercial_baselines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD CONSTRAINT "commercial_basis_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD CONSTRAINT "commercial_basis_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD CONSTRAINT "commercial_basis_links_work_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD CONSTRAINT "commercial_basis_links_scope_revision_project_fk" FOREIGN KEY ("scope_item_revision_id","project_id") REFERENCES "public"."commercial_scope_item_revisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_evidence_anchors" ADD CONSTRAINT "commercial_evidence_anchors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_evidence_anchors" ADD CONSTRAINT "commercial_evidence_anchors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_evidence_anchors" ADD CONSTRAINT "commercial_evidence_anchors_source_project_fk" FOREIGN KEY ("source_id","project_id") REFERENCES "public"."commercial_evidence_sources"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_evidence_sources" ADD CONSTRAINT "commercial_evidence_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_evidence_sources" ADD CONSTRAINT "commercial_evidence_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_revisions" ADD CONSTRAINT "commercial_scope_item_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_revisions" ADD CONSTRAINT "commercial_scope_item_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_revisions" ADD CONSTRAINT "commercial_scope_revisions_item_project_fk" FOREIGN KEY ("scope_item_id","project_id") REFERENCES "public"."commercial_scope_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ADD CONSTRAINT "commercial_scope_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ADD CONSTRAINT "commercial_scope_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ADD CONSTRAINT "commercial_scope_items_version_project_fk" FOREIGN KEY ("baseline_version_id","project_id") REFERENCES "public"."commercial_baseline_versions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_revision_anchors" ADD CONSTRAINT "commercial_scope_revision_anchors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_revision_anchors" ADD CONSTRAINT "commercial_scope_revision_anchors_revision_project_fk" FOREIGN KEY ("scope_item_revision_id","project_id") REFERENCES "public"."commercial_scope_item_revisions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_revision_anchors" ADD CONSTRAINT "commercial_scope_revision_anchors_anchor_project_fk" FOREIGN KEY ("evidence_anchor_id","project_id") REFERENCES "public"."commercial_evidence_anchors"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_baseline_versions_number_uidx" ON "commercial_baseline_versions" USING btree ("baseline_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_baselines_project_uidx" ON "commercial_baselines" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_basis_links_work_scope_uidx" ON "commercial_basis_links" USING btree ("work_item_id","scope_item_revision_id");--> statement-breakpoint
CREATE INDEX "commercial_basis_links_project_work_idx" ON "commercial_basis_links" USING btree ("project_id","work_item_id");--> statement-breakpoint
CREATE INDEX "commercial_evidence_anchors_source_offset_idx" ON "commercial_evidence_anchors" USING btree ("source_id","start_offset","id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_sources_project_idempotency_uidx" ON "commercial_evidence_sources" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "commercial_sources_project_created_idx" ON "commercial_evidence_sources" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_scope_revisions_number_uidx" ON "commercial_scope_item_revisions" USING btree ("scope_item_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_scope_revisions_idempotency_uidx" ON "commercial_scope_item_revisions" USING btree ("scope_item_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_scope_items_project_idempotency_uidx" ON "commercial_scope_items" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "commercial_scope_items_version_archived_idx" ON "commercial_scope_items" USING btree ("baseline_version_id","archived_at","id");
