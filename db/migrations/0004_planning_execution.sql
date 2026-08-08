CREATE TYPE "public"."cycle_lifecycle" AS ENUM('planned', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"lifecycle" "cycle_lifecycle" DEFAULT 'planned' NOT NULL,
	"goal" text,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "cycles_sequence_positive" CHECK ("cycles"."sequence" > 0),
	CONSTRAINT "cycles_date_order" CHECK ("cycles"."start_date" <= "cycles"."end_date")
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_project_sequence_uidx" ON "cycles" USING btree ("project_id","sequence");--> statement-breakpoint
CREATE INDEX "cycles_project_lifecycle_dates_idx" ON "cycles" USING btree ("project_id","lifecycle","start_date","sequence");--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_cycle_project_fk" FOREIGN KEY ("cycle_id","project_id") REFERENCES "public"."cycles"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_items_project_cycle_idx" ON "work_items" USING btree ("project_id","cycle_id");
--> statement-breakpoint
CREATE INDEX "work_items_assignee_status_target_idx" ON "work_items" USING btree ("assignee_user_id","status","target_date","id");
