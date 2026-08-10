CREATE TYPE "public"."commercial_baseline_version_state" AS ENUM('draft', 'effective', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."commercial_scope_lineage_kind" AS ENUM('carried_forward', 'revised', 'added', 'retired');--> statement-breakpoint
CREATE TABLE "commercial_baseline_version_decisions" (
	"project_id" uuid NOT NULL,
	"baseline_version_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	CONSTRAINT "commercial_baseline_version_decisions_baseline_version_id_decision_id_pk" PRIMARY KEY("baseline_version_id","decision_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_baseline_version_sources" (
	"project_id" uuid NOT NULL,
	"baseline_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "commercial_baseline_version_sources_baseline_version_id_source_id_pk" PRIMARY KEY("baseline_version_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_scope_item_lineages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"baseline_version_id" uuid NOT NULL,
	"previous_scope_item_id" uuid,
	"current_scope_item_id" uuid NOT NULL,
	"kind" "commercial_scope_lineage_kind" NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_scope_lineages_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_scope_lineages_shape" CHECK (("commercial_scope_item_lineages"."kind" = 'added' and "commercial_scope_item_lineages"."previous_scope_item_id" is null) or ("commercial_scope_item_lineages"."kind" <> 'added' and "commercial_scope_item_lineages"."previous_scope_item_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" DROP CONSTRAINT "commercial_baseline_versions_number_positive";--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ALTER COLUMN "version_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD COLUMN "previous_version_id" uuid;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD COLUMN "state" "commercial_baseline_version_state" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD COLUMN "effective_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD COLUMN "effective_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ADD COLUMN "material_basis_scope_item_id" uuid;--> statement-breakpoint
UPDATE "commercial_baseline_versions"
SET "label" = CASE
		WHEN "version_number" = 1 THEN 'Initial baseline'
		ELSE 'Baseline version ' || "version_number"::text
	END,
	"state" = 'effective',
	"effective_at" = "created_at",
	"effective_by_user_id" = "created_by_user_id";--> statement-breakpoint
INSERT INTO "commercial_baseline_version_sources" (
	"project_id",
	"baseline_version_id",
	"source_id"
)
SELECT "project_id", "id", "source_id"
FROM "commercial_baseline_versions";--> statement-breakpoint
UPDATE "commercial_scope_items"
SET "material_basis_scope_item_id" = "id";--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ALTER COLUMN "label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ALTER COLUMN "material_basis_scope_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ADD CONSTRAINT "commercial_scope_items_id_version_project_unique" UNIQUE("id","baseline_version_id","project_id");--> statement-breakpoint
ALTER TABLE "commercial_baseline_version_decisions" ADD CONSTRAINT "commercial_baseline_version_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_version_decisions" ADD CONSTRAINT "commercial_baseline_version_decisions_version_project_fk" FOREIGN KEY ("baseline_version_id","project_id") REFERENCES "public"."commercial_baseline_versions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_version_decisions" ADD CONSTRAINT "commercial_baseline_version_decisions_decision_project_fk" FOREIGN KEY ("decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_version_sources" ADD CONSTRAINT "commercial_baseline_version_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_version_sources" ADD CONSTRAINT "commercial_baseline_version_sources_version_project_fk" FOREIGN KEY ("baseline_version_id","project_id") REFERENCES "public"."commercial_baseline_versions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_version_sources" ADD CONSTRAINT "commercial_baseline_version_sources_source_project_fk" FOREIGN KEY ("source_id","project_id") REFERENCES "public"."commercial_evidence_sources"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_lineages" ADD CONSTRAINT "commercial_scope_item_lineages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_lineages" ADD CONSTRAINT "commercial_scope_item_lineages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_lineages" ADD CONSTRAINT "commercial_scope_lineages_version_project_fk" FOREIGN KEY ("baseline_version_id","project_id") REFERENCES "public"."commercial_baseline_versions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_lineages" ADD CONSTRAINT "commercial_scope_lineages_previous_project_fk" FOREIGN KEY ("previous_scope_item_id","project_id") REFERENCES "public"."commercial_scope_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_item_lineages" ADD CONSTRAINT "commercial_scope_lineages_current_version_project_fk" FOREIGN KEY ("current_scope_item_id","baseline_version_id","project_id") REFERENCES "public"."commercial_scope_items"("id","baseline_version_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_baseline_version_decisions_project_decision_idx" ON "commercial_baseline_version_decisions" USING btree ("project_id","decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_scope_lineages_version_previous_uidx" ON "commercial_scope_item_lineages" USING btree ("baseline_version_id","previous_scope_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_scope_lineages_version_current_uidx" ON "commercial_scope_item_lineages" USING btree ("baseline_version_id","current_scope_item_id");--> statement-breakpoint
CREATE INDEX "commercial_scope_lineages_project_kind_idx" ON "commercial_scope_item_lineages" USING btree ("project_id","kind","baseline_version_id");--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_effective_by_user_id_users_id_fk" FOREIGN KEY ("effective_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_previous_project_fk" FOREIGN KEY ("previous_version_id","project_id") REFERENCES "public"."commercial_baseline_versions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_scope_items" ADD CONSTRAINT "commercial_scope_items_material_basis_project_fk" FOREIGN KEY ("material_basis_scope_item_id","project_id") REFERENCES "public"."commercial_scope_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_baseline_versions_effective_uidx" ON "commercial_baseline_versions" USING btree ("baseline_id") WHERE "commercial_baseline_versions"."state" = 'effective';--> statement-breakpoint
CREATE INDEX "commercial_baseline_versions_project_state_idx" ON "commercial_baseline_versions" USING btree ("project_id","state","created_at","id");--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_label_length" CHECK (char_length(btrim("commercial_baseline_versions"."label")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_lifecycle" CHECK (("commercial_baseline_versions"."state" = 'draft' and "commercial_baseline_versions"."version_number" is null and "commercial_baseline_versions"."effective_at" is null and "commercial_baseline_versions"."effective_by_user_id" is null and "commercial_baseline_versions"."superseded_at" is null) or ("commercial_baseline_versions"."state" = 'effective' and "commercial_baseline_versions"."version_number" is not null and "commercial_baseline_versions"."effective_at" is not null and "commercial_baseline_versions"."effective_by_user_id" is not null and "commercial_baseline_versions"."superseded_at" is null) or ("commercial_baseline_versions"."state" = 'superseded' and "commercial_baseline_versions"."version_number" is not null and "commercial_baseline_versions"."effective_at" is not null and "commercial_baseline_versions"."effective_by_user_id" is not null and "commercial_baseline_versions"."superseded_at" is not null and "commercial_baseline_versions"."superseded_at" >= "commercial_baseline_versions"."effective_at"));--> statement-breakpoint
ALTER TABLE "commercial_baseline_versions" ADD CONSTRAINT "commercial_baseline_versions_number_positive" CHECK ("commercial_baseline_versions"."version_number" is null or "commercial_baseline_versions"."version_number" > 0);
