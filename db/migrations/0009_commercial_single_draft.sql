CREATE UNIQUE INDEX "commercial_baseline_versions_draft_uidx" ON "commercial_baseline_versions" USING btree ("baseline_id") WHERE "commercial_baseline_versions"."state" = 'draft';
