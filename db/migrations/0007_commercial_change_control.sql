CREATE TYPE "public"."commercial_coverage_basis" AS ENUM('baseline', 'defect_or_warranty', 'revision_allowance', 'other_existing_obligation');--> statement-breakpoint
CREATE TYPE "public"."commercial_decision_disposition" AS ENUM('covered', 'absorbed', 'swap', 'paid_change', 'deferred', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."commercial_decision_scope_role" AS ENUM('affected', 'swap_offset');--> statement-breakpoint
CREATE TYPE "public"."commercial_impact_confidence" AS ENUM('estimate', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."commercial_request_state" AS ENUM('open', 'needs_clarification', 'resolved', 'withdrawn');--> statement-breakpoint
ALTER TABLE "commercial_basis_links" DROP CONSTRAINT "commercial_basis_links_target";--> statement-breakpoint
ALTER TYPE "public"."commercial_basis_type" RENAME TO commercial_basis_type_previous;--> statement-breakpoint
CREATE TYPE "public"."commercial_basis_type" AS ENUM('baseline_scope_item', 'commercial_decision');--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ALTER COLUMN "basis_type" TYPE "public"."commercial_basis_type" USING "basis_type"::text::"public"."commercial_basis_type";--> statement-breakpoint
DROP TYPE public.commercial_basis_type_previous;--> statement-breakpoint
CREATE TABLE "commercial_decision_anchors" (
	"project_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"evidence_anchor_id" uuid NOT NULL,
	CONSTRAINT "commercial_decision_anchors_decision_id_evidence_anchor_id_pk" PRIMARY KEY("decision_id","evidence_anchor_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_decision_scope_items" (
	"project_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"scope_item_id" uuid NOT NULL,
	"role" "commercial_decision_scope_role" NOT NULL,
	CONSTRAINT "commercial_decision_scope_items_decision_id_scope_item_id_role_pk" PRIMARY KEY("decision_id","scope_item_id","role")
);
--> statement-breakpoint
CREATE TABLE "commercial_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"disposition" "commercial_decision_disposition" NOT NULL,
	"coverage_basis" "commercial_coverage_basis",
	"rationale" text,
	"supersedes_decision_id" uuid,
	"confirmed_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_decisions_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_decisions_coverage_basis" CHECK ("commercial_decisions"."disposition" = 'covered' or "commercial_decisions"."coverage_basis" is null),
	CONSTRAINT "commercial_decisions_rationale_length" CHECK ("commercial_decisions"."rationale" is null or char_length("commercial_decisions"."rationale") <= 10000),
	CONSTRAINT "commercial_decisions_superseded_time" CHECK ("commercial_decisions"."superseded_at" is null or "commercial_decisions"."superseded_at" >= "commercial_decisions"."confirmed_at")
);
--> statement-breakpoint
CREATE TABLE "commercial_impact_assessment_anchors" (
	"project_id" uuid NOT NULL,
	"impact_assessment_id" uuid NOT NULL,
	"evidence_anchor_id" uuid NOT NULL,
	CONSTRAINT "commercial_impact_assessment_anchors_impact_assessment_id_evidence_anchor_id_pk" PRIMARY KEY("impact_assessment_id","evidence_anchor_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_impact_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"decision_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"confidence" "commercial_impact_confidence" NOT NULL,
	"effort_minutes" integer,
	"schedule_delta_days" integer,
	"target_date" date,
	"monetary_amount" numeric(18, 2),
	"currency_code" text,
	"notes" text,
	"supersedes_impact_assessment_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_impacts_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_impacts_has_value" CHECK ("commercial_impact_assessments"."effort_minutes" is not null or "commercial_impact_assessments"."schedule_delta_days" is not null or "commercial_impact_assessments"."target_date" is not null or "commercial_impact_assessments"."monetary_amount" is not null),
	CONSTRAINT "commercial_impacts_effort_range" CHECK ("commercial_impact_assessments"."effort_minutes" is null or "commercial_impact_assessments"."effort_minutes" between 0 and 100000000),
	CONSTRAINT "commercial_impacts_schedule_range" CHECK ("commercial_impact_assessments"."schedule_delta_days" is null or "commercial_impact_assessments"."schedule_delta_days" between -3650 and 3650),
	CONSTRAINT "commercial_impacts_money_pair" CHECK (("commercial_impact_assessments"."monetary_amount" is null and "commercial_impact_assessments"."currency_code" is null) or ("commercial_impact_assessments"."monetary_amount" is not null and "commercial_impact_assessments"."currency_code" ~ '^[A-Z]{3}$')),
	CONSTRAINT "commercial_impacts_notes_length" CHECK ("commercial_impact_assessments"."notes" is null or char_length("commercial_impact_assessments"."notes") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "commercial_request_anchors" (
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"evidence_anchor_id" uuid NOT NULL,
	CONSTRAINT "commercial_request_anchors_request_id_evidence_anchor_id_pk" PRIMARY KEY("request_id","evidence_anchor_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_request_scope_items" (
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"scope_item_id" uuid NOT NULL,
	CONSTRAINT "commercial_request_scope_items_request_id_scope_item_id_pk" PRIMARY KEY("request_id","scope_item_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"state" "commercial_request_state" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"request_text" text NOT NULL,
	"external_requester" text,
	"received_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_requests_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "commercial_requests_title_length" CHECK (char_length(btrim("commercial_requests"."title")) between 1 and 240),
	CONSTRAINT "commercial_requests_text_length" CHECK (char_length(btrim("commercial_requests"."request_text")) between 1 and 10000),
	CONSTRAINT "commercial_requests_external_requester_length" CHECK ("commercial_requests"."external_requester" is null or char_length(btrim("commercial_requests"."external_requester")) between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD COLUMN "decision_id" uuid;--> statement-breakpoint
ALTER TABLE "commercial_decision_anchors" ADD CONSTRAINT "commercial_decision_anchors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decision_anchors" ADD CONSTRAINT "commercial_decision_anchors_decision_project_fk" FOREIGN KEY ("decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decision_anchors" ADD CONSTRAINT "commercial_decision_anchors_anchor_project_fk" FOREIGN KEY ("evidence_anchor_id","project_id") REFERENCES "public"."commercial_evidence_anchors"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decision_scope_items" ADD CONSTRAINT "commercial_decision_scope_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decision_scope_items" ADD CONSTRAINT "commercial_decision_scope_items_decision_project_fk" FOREIGN KEY ("decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decision_scope_items" ADD CONSTRAINT "commercial_decision_scope_items_scope_project_fk" FOREIGN KEY ("scope_item_id","project_id") REFERENCES "public"."commercial_scope_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decisions" ADD CONSTRAINT "commercial_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decisions" ADD CONSTRAINT "commercial_decisions_supersedes_project_fk" FOREIGN KEY ("supersedes_decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decisions" ADD CONSTRAINT "commercial_decisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_decisions" ADD CONSTRAINT "commercial_decisions_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessment_anchors" ADD CONSTRAINT "commercial_impact_assessment_anchors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessment_anchors" ADD CONSTRAINT "commercial_impact_anchors_impact_project_fk" FOREIGN KEY ("impact_assessment_id","project_id") REFERENCES "public"."commercial_impact_assessments"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessment_anchors" ADD CONSTRAINT "commercial_impact_anchors_anchor_project_fk" FOREIGN KEY ("evidence_anchor_id","project_id") REFERENCES "public"."commercial_evidence_anchors"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessments" ADD CONSTRAINT "commercial_impact_assessments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessments" ADD CONSTRAINT "commercial_impacts_supersedes_project_fk" FOREIGN KEY ("supersedes_impact_assessment_id","project_id") REFERENCES "public"."commercial_impact_assessments"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessments" ADD CONSTRAINT "commercial_impact_assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessments" ADD CONSTRAINT "commercial_impacts_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_impact_assessments" ADD CONSTRAINT "commercial_impacts_decision_project_fk" FOREIGN KEY ("decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_anchors" ADD CONSTRAINT "commercial_request_anchors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_anchors" ADD CONSTRAINT "commercial_request_anchors_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_anchors" ADD CONSTRAINT "commercial_request_anchors_anchor_project_fk" FOREIGN KEY ("evidence_anchor_id","project_id") REFERENCES "public"."commercial_evidence_anchors"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_scope_items" ADD CONSTRAINT "commercial_request_scope_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_scope_items" ADD CONSTRAINT "commercial_request_scope_items_request_project_fk" FOREIGN KEY ("request_id","project_id") REFERENCES "public"."commercial_requests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_request_scope_items" ADD CONSTRAINT "commercial_request_scope_items_scope_project_fk" FOREIGN KEY ("scope_item_id","project_id") REFERENCES "public"."commercial_scope_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_requests" ADD CONSTRAINT "commercial_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_requests" ADD CONSTRAINT "commercial_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_decisions_request_idempotency_uidx" ON "commercial_decisions" USING btree ("request_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_decisions_supersedes_uidx" ON "commercial_decisions" USING btree ("supersedes_decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_decisions_current_request_uidx" ON "commercial_decisions" USING btree ("request_id") WHERE "commercial_decisions"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "commercial_decisions_project_confirmed_idx" ON "commercial_decisions" USING btree ("project_id","confirmed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_impacts_request_idempotency_uidx" ON "commercial_impact_assessments" USING btree ("request_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_impacts_supersedes_uidx" ON "commercial_impact_assessments" USING btree ("supersedes_impact_assessment_id");--> statement-breakpoint
CREATE INDEX "commercial_impacts_request_created_idx" ON "commercial_impact_assessments" USING btree ("request_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_requests_project_idempotency_uidx" ON "commercial_requests" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "commercial_requests_project_state_received_idx" ON "commercial_requests" USING btree ("project_id","state","received_at","id");--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD CONSTRAINT "commercial_basis_links_decision_project_fk" FOREIGN KEY ("decision_id","project_id") REFERENCES "public"."commercial_decisions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_basis_links_work_decision_uidx" ON "commercial_basis_links" USING btree ("work_item_id","decision_id");--> statement-breakpoint
ALTER TABLE "commercial_basis_links" ADD CONSTRAINT "commercial_basis_links_target" CHECK (("commercial_basis_links"."basis_type" = 'baseline_scope_item' and "commercial_basis_links"."scope_item_revision_id" is not null and "commercial_basis_links"."decision_id" is null) or ("commercial_basis_links"."basis_type" = 'commercial_decision' and "commercial_basis_links"."scope_item_revision_id" is null and "commercial_basis_links"."decision_id" is not null));
