CREATE TYPE "public"."client_lifecycle" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('planned', 'in_progress', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_lifecycle" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."work_item_priority" AS ENUM('none', 'low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('backlog', 'ready', 'in_progress', 'in_review', 'done', 'canceled');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"internal_reference" text,
	"summary" text,
	"lifecycle" "client_lifecycle" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" date,
	"status" "milestone_status" DEFAULT 'planned' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "project_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_labels_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"project_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_memberships_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"lead_user_id" uuid NOT NULL,
	"lifecycle" "project_lifecycle" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"target_date" date,
	"next_work_item_number" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "projects_next_work_item_positive" CHECK ("projects"."next_work_item_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "work_item_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"blocker_work_item_id" uuid NOT NULL,
	"blocked_work_item_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_dependencies_not_self" CHECK ("work_item_dependencies"."blocker_work_item_id" <> "work_item_dependencies"."blocked_work_item_id")
);
--> statement-breakpoint
CREATE TABLE "work_item_labels" (
	"work_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "work_item_labels_work_item_id_label_id_pk" PRIMARY KEY("work_item_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"acceptance_criteria" text,
	"status" "work_item_status" DEFAULT 'backlog' NOT NULL,
	"priority" "work_item_priority" DEFAULT 'none' NOT NULL,
	"assignee_user_id" uuid,
	"estimate_points" integer,
	"target_date" date,
	"milestone_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "work_items_number_positive" CHECK ("work_items"."number" > 0),
	CONSTRAINT "work_items_estimate_range" CHECK ("work_items"."estimate_points" is null or "work_items"."estimate_points" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_workspace_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_workspace_fk" FOREIGN KEY ("client_id","workspace_id") REFERENCES "public"."clients"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_blocker_project_fk" FOREIGN KEY ("blocker_work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_blocked_project_fk" FOREIGN KEY ("blocked_work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_item_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_label_project_fk" FOREIGN KEY ("label_id","project_id") REFERENCES "public"."project_labels"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parent_project_fk" FOREIGN KEY ("parent_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_milestone_project_fk" FOREIGN KEY ("milestone_id","project_id") REFERENCES "public"."milestones"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_workspace_lifecycle_name_idx" ON "clients" USING btree ("workspace_id","lifecycle","name");--> statement-breakpoint
CREATE INDEX "milestones_project_status_order_idx" ON "milestones" USING btree ("project_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "project_labels_project_name_uidx" ON "project_labels" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "project_memberships_workspace_user_idx" ON "project_memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_key_uidx" ON "projects" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "projects_workspace_lifecycle_name_idx" ON "projects" USING btree ("workspace_id","lifecycle","name");--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_dependencies_edge_uidx" ON "work_item_dependencies" USING btree ("project_id","blocker_work_item_id","blocked_work_item_id");--> statement-breakpoint
CREATE INDEX "work_item_dependencies_blocked_idx" ON "work_item_dependencies" USING btree ("project_id","blocked_work_item_id");--> statement-breakpoint
CREATE INDEX "work_item_labels_project_label_idx" ON "work_item_labels" USING btree ("project_id","label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_project_number_uidx" ON "work_items" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "work_items_project_status_order_idx" ON "work_items" USING btree ("project_id","status","sort_order","id");--> statement-breakpoint
CREATE INDEX "work_items_project_assignee_idx" ON "work_items" USING btree ("project_id","assignee_user_id");--> statement-breakpoint
CREATE INDEX "work_items_project_milestone_idx" ON "work_items" USING btree ("project_id","milestone_id");
