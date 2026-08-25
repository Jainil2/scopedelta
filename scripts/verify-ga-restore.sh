#!/usr/bin/env bash
set -euo pipefail

container_id="${GA_POSTGRES_CONTAINER_ID:-}"
if [[ -z "$container_id" ]]; then
  echo "GA_POSTGRES_CONTAINER_ID is required" >&2
  exit 2
fi

source_database="scopedelta_test"
restore_database="scopedelta_ga_restore"
dump_path="/tmp/scopedelta-ga.dump"

docker exec "$container_id" dropdb --if-exists -U scopedelta "$restore_database"
docker exec "$container_id" createdb -U scopedelta "$restore_database"
docker exec "$container_id" pg_dump -U scopedelta -d "$source_database" --format=custom --file="$dump_path"
docker exec "$container_id" pg_restore -U scopedelta -d "$restore_database" --exit-on-error "$dump_path"

evidence_query="select json_build_object(
  'commercial_sources', (select count(*) from commercial_evidence_sources),
  'commercial_hashes', (select coalesce(string_agg(content_sha256, ',' order by content_sha256), '') from commercial_evidence_sources),
  'client_actions', (select count(*) from client_acceptance_actions),
  'audit_events', (select count(*) from audit_events),
  'provider_deliveries', (select count(*) from provider_webhook_deliveries),
  'ai_jobs', (select count(*) from ai_jobs),
  'imports', (select count(*) from migration_import_sessions),
  'lifecycle_requests', (select count(*) from workspace_lifecycle_requests)
)::text"

source_evidence="$(docker exec "$container_id" psql -U scopedelta -d "$source_database" -Atqc "$evidence_query")"
restored_evidence="$(docker exec "$container_id" psql -U scopedelta -d "$restore_database" -Atqc "$evidence_query")"

if [[ "$source_evidence" != "$restored_evidence" ]]; then
  echo "GA restore evidence mismatch" >&2
  exit 1
fi

echo "$restored_evidence"
