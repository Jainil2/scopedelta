CREATE TYPE "public"."delivery_time_classification" AS ENUM('billable', 'non_billable');--> statement-breakpoint
CREATE TABLE "delivery_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"member_user_id" uuid NOT NULL,
	"work_item_id" uuid,
	"work_date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"classification" "delivery_time_classification" NOT NULL,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_time_entries_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "delivery_time_entries_duration_range" CHECK ("delivery_time_entries"."duration_minutes" between 1 and 1440),
	CONSTRAINT "delivery_time_entries_note_length" CHECK ("delivery_time_entries"."note" is null or char_length("delivery_time_entries"."note") <= 500),
	CONSTRAINT "delivery_time_entries_owner_consistency" CHECK ("delivery_time_entries"."member_user_id" = "delivery_time_entries"."created_by_user_id"),
	CONSTRAINT "delivery_time_entries_delete_consistency" CHECK (("delivery_time_entries"."deleted_at" is null and "delivery_time_entries"."deleted_by_user_id" is null) or ("delivery_time_entries"."deleted_at" is not null and "delivery_time_entries"."deleted_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "member_delivery_availability_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weekly_minutes" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_delivery_availability_minutes_range" CHECK ("member_delivery_availability_periods"."weekly_minutes" between 0 and 10080),
	CONSTRAINT "member_delivery_availability_date_order" CHECK ("member_delivery_availability_periods"."effective_to" is null or "member_delivery_availability_periods"."effective_from" <= "member_delivery_availability_periods"."effective_to"),
	CONSTRAINT "member_delivery_availability_iso_weeks" CHECK (extract(isodow from "member_delivery_availability_periods"."effective_from") = 1 and ("member_delivery_availability_periods"."effective_to" is null or extract(isodow from "member_delivery_availability_periods"."effective_to") = 7))
);
--> statement-breakpoint
CREATE TABLE "project_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"member_user_id" uuid NOT NULL,
	"start_week" date NOT NULL,
	"end_week" date NOT NULL,
	"planned_minutes_per_week" integer NOT NULL,
	"role_label" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_allocations_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "project_allocations_date_order" CHECK ("project_allocations"."start_week" <= "project_allocations"."end_week"),
	CONSTRAINT "project_allocations_iso_mondays" CHECK (extract(isodow from "project_allocations"."start_week") = 1 and extract(isodow from "project_allocations"."end_week") = 1),
	CONSTRAINT "project_allocations_minutes_range" CHECK ("project_allocations"."planned_minutes_per_week" between 1 and 10080),
	CONSTRAINT "project_allocations_role_label_length" CHECK ("project_allocations"."role_label" is null or char_length(btrim("project_allocations"."role_label")) between 1 and 80),
	CONSTRAINT "project_allocations_delete_consistency" CHECK (("project_allocations"."deleted_at" is null and "project_allocations"."deleted_by_user_id" is null) or ("project_allocations"."deleted_at" is not null and "project_allocations"."deleted_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "workspace_delivery_availability_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"weekly_minutes" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_delivery_availability_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "workspace_delivery_availability_minutes_range" CHECK ("workspace_delivery_availability_periods"."weekly_minutes" between 0 and 10080),
	CONSTRAINT "workspace_delivery_availability_date_order" CHECK ("workspace_delivery_availability_periods"."effective_to" is null or "workspace_delivery_availability_periods"."effective_from" <= "workspace_delivery_availability_periods"."effective_to"),
	CONSTRAINT "workspace_delivery_availability_iso_weeks" CHECK (extract(isodow from "workspace_delivery_availability_periods"."effective_from") = 1 and ("workspace_delivery_availability_periods"."effective_to" is null or extract(isodow from "workspace_delivery_availability_periods"."effective_to") = 7))
);
--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_workspace_member_fk" FOREIGN KEY ("workspace_id","member_user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_work_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_delivery_availability_periods" ADD CONSTRAINT "member_delivery_availability_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_delivery_availability_periods" ADD CONSTRAINT "member_delivery_availability_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_delivery_availability_periods" ADD CONSTRAINT "member_delivery_availability_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_delivery_availability_periods" ADD CONSTRAINT "member_delivery_availability_workspace_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_workspace_member_fk" FOREIGN KEY ("workspace_id","member_user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_delivery_availability_periods" ADD CONSTRAINT "workspace_delivery_availability_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_delivery_availability_periods" ADD CONSTRAINT "workspace_delivery_availability_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_time_entries_member_date_idx" ON "delivery_time_entries" USING btree ("workspace_id","member_user_id","work_date","id");--> statement-breakpoint
CREATE INDEX "delivery_time_entries_project_member_date_idx" ON "delivery_time_entries" USING btree ("project_id","member_user_id","work_date","id");--> statement-breakpoint
CREATE INDEX "delivery_time_entries_work_date_idx" ON "delivery_time_entries" USING btree ("work_item_id","work_date","id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_delivery_availability_start_uidx" ON "member_delivery_availability_periods" USING btree ("workspace_id","user_id","effective_from");--> statement-breakpoint
CREATE INDEX "member_delivery_availability_range_idx" ON "member_delivery_availability_periods" USING btree ("workspace_id","user_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "project_allocations_member_weeks_idx" ON "project_allocations" USING btree ("workspace_id","member_user_id","start_week","end_week","id");--> statement-breakpoint
CREATE INDEX "project_allocations_project_weeks_idx" ON "project_allocations" USING btree ("project_id","start_week","end_week","id");--> statement-breakpoint
CREATE INDEX "project_allocations_workspace_updated_idx" ON "project_allocations" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_delivery_availability_start_uidx" ON "workspace_delivery_availability_periods" USING btree ("workspace_id","effective_from");--> statement-breakpoint
CREATE INDEX "workspace_delivery_availability_range_idx" ON "workspace_delivery_availability_periods" USING btree ("workspace_id","effective_from","effective_to");--> statement-breakpoint
INSERT INTO "workspace_delivery_availability_periods" (
	"workspace_id",
	"weekly_minutes",
	"effective_from",
	"created_by_user_id"
)
SELECT DISTINCT ON (membership."workspace_id")
	membership."workspace_id",
	2400,
	DATE '1970-01-05',
	membership."user_id"
FROM "memberships" membership
ORDER BY membership."workspace_id", CASE membership."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, membership."created_at";
