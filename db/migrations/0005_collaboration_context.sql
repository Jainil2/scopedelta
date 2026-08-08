CREATE TYPE "public"."notification_kind" AS ENUM('mention', 'work_item_assigned', 'comment_added', 'comment_reply');--> statement-breakpoint
CREATE TYPE "public"."work_item_subscription_source" AS ENUM('automatic', 'explicit');--> statement-breakpoint
CREATE TYPE "public"."work_item_subscription_state" AS ENUM('watching', 'muted');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"actor_user_id" uuid,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid,
	"comment_id" uuid,
	"project_note_id" uuid,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_note_mentions" (
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_note_mentions_note_id_user_id_pk" PRIMARY KEY("note_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_notes_title_length" CHECK (char_length(btrim("project_notes"."title")) between 1 and 120),
	CONSTRAINT "project_notes_body_length" CHECK (char_length(btrim("project_notes"."body")) between 1 and 20000)
);
--> statement-breakpoint
CREATE TABLE "work_item_comment_mentions" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_comment_mentions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "work_item_comment_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"editor_user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_comment_revisions_version_positive" CHECK ("work_item_comment_revisions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "work_item_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"body" text,
	"version" integer DEFAULT 1 NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_comments_id_item_project_unique" UNIQUE("id","work_item_id","project_id"),
	CONSTRAINT "work_item_comments_version_positive" CHECK ("work_item_comments"."version" > 0),
	CONSTRAINT "work_item_comments_body_state" CHECK (("work_item_comments"."deleted_at" is null and "work_item_comments"."body" is not null and char_length(btrim("work_item_comments"."body")) between 1 and 10000) or ("work_item_comments"."deleted_at" is not null and "work_item_comments"."body" is null))
);
--> statement-breakpoint
CREATE TABLE "work_item_subscriptions" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "work_item_subscription_state" DEFAULT 'watching' NOT NULL,
	"source" "work_item_subscription_source" DEFAULT 'automatic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_subscriptions_work_item_id_user_id_pk" PRIMARY KEY("work_item_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_work_item_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."work_item_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_note_id_project_notes_id_fk" FOREIGN KEY ("project_note_id") REFERENCES "public"."project_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_item_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_note_mentions" ADD CONSTRAINT "project_note_mentions_note_id_project_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."project_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_note_mentions" ADD CONSTRAINT "project_note_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comment_mentions" ADD CONSTRAINT "work_item_comment_mentions_comment_id_work_item_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."work_item_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comment_mentions" ADD CONSTRAINT "work_item_comment_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comment_revisions" ADD CONSTRAINT "work_item_comment_revisions_comment_id_work_item_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."work_item_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comment_revisions" ADD CONSTRAINT "work_item_comment_revisions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_item_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_parent_item_project_fk" FOREIGN KEY ("parent_comment_id","work_item_id","project_id") REFERENCES "public"."work_item_comments"("id","work_item_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_subscriptions" ADD CONSTRAINT "work_item_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_subscriptions" ADD CONSTRAINT "work_item_subscriptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_subscriptions" ADD CONSTRAINT "work_item_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_subscriptions" ADD CONSTRAINT "work_item_subscriptions_item_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_subscriptions" ADD CONSTRAINT "work_item_subscriptions_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_subscriptions" ADD CONSTRAINT "work_item_subscriptions_workspace_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_recipient_dedupe_uidx" ON "notifications" USING btree ("workspace_id","user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_created_idx" ON "notifications" USING btree ("workspace_id","user_id","read_at","created_at","id");--> statement-breakpoint
CREATE INDEX "notifications_project_recipient_idx" ON "notifications" USING btree ("project_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "project_note_mentions_user_idx" ON "project_note_mentions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_notes_project_request_uidx" ON "project_notes" USING btree ("project_id","request_id");--> statement-breakpoint
CREATE INDEX "project_notes_project_archived_updated_idx" ON "project_notes" USING btree ("project_id","archived_at","updated_at","id");--> statement-breakpoint
CREATE INDEX "work_item_comment_mentions_user_idx" ON "work_item_comment_mentions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_comment_revisions_version_uidx" ON "work_item_comment_revisions" USING btree ("comment_id","version");--> statement-breakpoint
CREATE INDEX "work_item_comment_revisions_comment_created_idx" ON "work_item_comment_revisions" USING btree ("comment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_comments_item_request_uidx" ON "work_item_comments" USING btree ("work_item_id","request_id");--> statement-breakpoint
CREATE INDEX "work_item_comments_item_created_idx" ON "work_item_comments" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_comments_author_idx" ON "work_item_comments" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "work_item_subscriptions_project_state_idx" ON "work_item_subscriptions" USING btree ("project_id","state","user_id");
