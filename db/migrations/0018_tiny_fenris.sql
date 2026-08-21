CREATE TABLE "migration_import_session_identities" (
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_import_session_identities_pk" PRIMARY KEY("session_id","identity_id")
);
--> statement-breakpoint
ALTER TABLE "migration_source_identities" ADD CONSTRAINT "migration_source_identities_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "migration_import_session_identities" ADD CONSTRAINT "migration_import_session_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_session_identities" ADD CONSTRAINT "migration_import_session_identities_session_workspace_fk" FOREIGN KEY ("session_id","workspace_id") REFERENCES "public"."migration_import_sessions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_import_session_identities" ADD CONSTRAINT "migration_import_session_identities_identity_workspace_fk" FOREIGN KEY ("identity_id","workspace_id") REFERENCES "public"."migration_source_identities"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "migration_import_session_identities_workspace_session_idx" ON "migration_import_session_identities" USING btree ("workspace_id","session_id","identity_id");--> statement-breakpoint
INSERT INTO "migration_import_session_identities" ("workspace_id", "session_id", "identity_id")
SELECT "workspace_id", "first_session_id", "id" FROM "migration_source_identities"
UNION
SELECT "workspace_id", "last_session_id", "id" FROM "migration_source_identities"
ON CONFLICT DO NOTHING;
