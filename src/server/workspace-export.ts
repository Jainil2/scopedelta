import { createHash, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { getPool } from "@/db";
import { PlatformError, notFound } from "@/lib/platform-errors";
import { consumeActionLimit } from "@/server/action-rate-limit";
import { requireWorkspaceOwner } from "@/server/self-service";
import { createDeterministicTarGz, type TarEntry } from "@/server/tar";
import type { UserActor } from "@/server/workspaces";

const EXPORT_FORMAT_VERSION = 1;
const EXPORT_TTL_MS = 24 * 60 * 60_000;
const MAX_DATASET_ROWS = 100_000;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const TARGET_PART_BYTES = 10 * 1024 * 1024;
const MAX_PART_BYTES = 15 * 1024 * 1024 - 1;
const EXCLUDED_COLUMNS = [
  "password",
  "token",
  "token_hash",
  "access_token",
  "refresh_token",
  "id_token",
  "private_key",
  "checkout_url",
  "raw_payload",
  "payload",
  "original_content",
  "artifact",
];

type Scope =
  | "workspace"
  | "project"
  | "comment"
  | "note"
  | "ai_job"
  | "ai_execution"
  | "export"
  | "repository";
type DatasetSpec = { table: string; scope: Scope; group: string };

const DATASETS: DatasetSpec[] = [
  { table: "workspaces", scope: "workspace", group: "workspace" },
  { table: "memberships", scope: "workspace", group: "workspace" },
  { table: "workspace_invitations", scope: "workspace", group: "workspace" },
  { table: "workspace_settings", scope: "workspace", group: "workspace" },
  {
    table: "workspace_onboarding_preferences",
    scope: "workspace",
    group: "workspace",
  },
  { table: "clients", scope: "workspace", group: "delivery" },
  { table: "projects", scope: "workspace", group: "delivery" },
  { table: "milestones", scope: "project", group: "delivery" },
  { table: "cycles", scope: "project", group: "delivery" },
  { table: "work_items", scope: "project", group: "delivery" },
  { table: "project_memberships", scope: "project", group: "delivery" },
  {
    table: "workspace_delivery_availability_periods",
    scope: "workspace",
    group: "delivery",
  },
  {
    table: "member_delivery_availability_periods",
    scope: "workspace",
    group: "delivery",
  },
  { table: "project_labels", scope: "project", group: "delivery" },
  { table: "project_templates", scope: "workspace", group: "delivery" },
  {
    table: "project_template_applications",
    scope: "workspace",
    group: "delivery",
  },
  { table: "project_allocations", scope: "project", group: "delivery" },
  { table: "delivery_time_entries", scope: "project", group: "delivery" },
  { table: "work_item_labels", scope: "project", group: "delivery" },
  { table: "work_item_dependencies", scope: "project", group: "delivery" },
  { table: "project_notes", scope: "project", group: "collaboration" },
  {
    table: "project_note_mentions",
    scope: "note",
    group: "collaboration",
  },
  { table: "work_item_comments", scope: "project", group: "collaboration" },
  {
    table: "work_item_comment_revisions",
    scope: "comment",
    group: "collaboration",
  },
  {
    table: "work_item_comment_mentions",
    scope: "comment",
    group: "collaboration",
  },
  {
    table: "work_item_subscriptions",
    scope: "workspace",
    group: "collaboration",
  },
  { table: "notifications", scope: "workspace", group: "collaboration" },
  {
    table: "commercial_evidence_sources",
    scope: "project",
    group: "commercial",
  },
  { table: "commercial_baselines", scope: "project", group: "commercial" },
  {
    table: "commercial_baseline_versions",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_baseline_version_sources",
    scope: "project",
    group: "commercial",
  },
  { table: "commercial_scope_items", scope: "project", group: "commercial" },
  {
    table: "commercial_scope_item_revisions",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_scope_item_lineages",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_evidence_anchors",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_scope_revision_anchors",
    scope: "project",
    group: "commercial",
  },
  { table: "commercial_requests", scope: "project", group: "commercial" },
  {
    table: "commercial_request_anchors",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_request_scope_items",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_request_clarifications",
    scope: "project",
    group: "commercial",
  },
  { table: "commercial_decisions", scope: "project", group: "commercial" },
  {
    table: "commercial_decision_anchors",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_decision_scope_items",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_baseline_version_decisions",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_impact_assessments",
    scope: "project",
    group: "commercial",
  },
  {
    table: "commercial_impact_assessment_anchors",
    scope: "project",
    group: "commercial",
  },
  { table: "commercial_basis_links", scope: "project", group: "commercial" },
  { table: "client_project_profiles", scope: "project", group: "client" },
  { table: "client_project_participants", scope: "project", group: "client" },
  { table: "client_project_invitations", scope: "project", group: "client" },
  { table: "client_project_items", scope: "project", group: "client" },
  { table: "client_discussion_messages", scope: "project", group: "client" },
  { table: "client_commercial_packets", scope: "project", group: "client" },
  {
    table: "client_commercial_packet_scope_references",
    scope: "project",
    group: "client",
  },
  {
    table: "client_commercial_packet_actions",
    scope: "project",
    group: "client",
  },
  { table: "client_acceptance_targets", scope: "project", group: "client" },
  {
    table: "client_acceptance_target_packets",
    scope: "project",
    group: "client",
  },
  { table: "client_acceptance_actions", scope: "project", group: "client" },
  {
    table: "client_collaboration_notifications",
    scope: "workspace",
    group: "client",
  },
  {
    table: "engineering_provider_installations",
    scope: "workspace",
    group: "engineering",
  },
  {
    table: "engineering_repositories",
    scope: "workspace",
    group: "engineering",
  },
  { table: "implementation_artifacts", scope: "project", group: "engineering" },
  {
    table: "implementation_artifact_snapshots",
    scope: "project",
    group: "engineering",
  },
  {
    table: "work_implementation_links",
    scope: "project",
    group: "engineering",
  },
  { table: "verification_records", scope: "project", group: "engineering" },
  { table: "defects", scope: "project", group: "engineering" },
  { table: "ai_jobs", scope: "workspace", group: "ai" },
  { table: "ai_job_attempts", scope: "ai_job", group: "ai" },
  { table: "ai_action_executions", scope: "workspace", group: "ai" },
  { table: "ai_action_records", scope: "ai_execution", group: "ai" },
  { table: "migration_import_sessions", scope: "workspace", group: "imports" },
  { table: "migration_import_rows", scope: "workspace", group: "imports" },
  {
    table: "migration_source_identities",
    scope: "workspace",
    group: "imports",
  },
  {
    table: "migration_import_session_identities",
    scope: "workspace",
    group: "imports",
  },
  {
    table: "migration_source_objects",
    scope: "workspace",
    group: "imports",
  },
  { table: "workspace_billing_states", scope: "workspace", group: "billing" },
  { table: "billing_checkout_attempts", scope: "workspace", group: "billing" },
  { table: "billing_provider_events", scope: "workspace", group: "billing" },
  { table: "managed_usage_records", scope: "workspace", group: "billing" },
  {
    table: "provider_webhook_deliveries",
    scope: "repository",
    group: "operations",
  },
  { table: "audit_events", scope: "workspace", group: "audit" },
  {
    table: "workspace_lifecycle_requests",
    scope: "workspace",
    group: "lifecycle",
  },
  {
    table: "workspace_product_signals",
    scope: "workspace",
    group: "operations",
  },
  { table: "operator_incidents", scope: "workspace", group: "operations" },
  { table: "workspace_export_runs", scope: "workspace", group: "exports" },
  { table: "workspace_export_parts", scope: "export", group: "exports" },
];

type ExportEntry = TarEntry & { sha256: string };

function sha256(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error("export_table_invalid");
  return `"${value}"`;
}

function jsonLine(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

function splitNdjson(path: string, records: unknown[]) {
  const entries: ExportEntry[] = [];
  let lines: string[] = [];
  let bytes = 0;
  let segment = 1;
  const flush = () => {
    if (!lines.length) return;
    const content = Buffer.from(lines.join(""), "utf8");
    const name = `${path}.${String(segment).padStart(4, "0")}.ndjson`;
    entries.push({ name, content, sha256: sha256(content) });
    lines = [];
    bytes = 0;
    segment += 1;
  };
  for (const record of records) {
    const line = jsonLine(record);
    const lineBytes = Buffer.byteLength(line);
    if (lineBytes > MAX_ENTRY_BYTES) throw new Error("export_record_too_large");
    if (bytes + lineBytes > MAX_ENTRY_BYTES) flush();
    lines.push(line);
    bytes += lineBytes;
  }
  flush();
  if (!entries.length) {
    const content = Buffer.alloc(0);
    entries.push({
      name: `${path}.0001.ndjson`,
      content,
      sha256: sha256(content),
    });
  }
  return entries;
}

async function readDataset(
  client: PoolClient,
  workspaceId: string,
  spec: DatasetSpec,
) {
  const table = quoteIdentifier(spec.table);
  const excluded = EXCLUDED_COLUMNS.map((_, index) => `$${index + 2}`).join(
    ",",
  );
  const scope =
    spec.table === "workspaces"
      ? "t.id = $1"
      : spec.scope === "workspace"
        ? "t.workspace_id = $1"
        : spec.scope === "project"
          ? "t.project_id in (select id from projects where workspace_id = $1)"
          : spec.scope === "comment"
            ? "t.comment_id in (select id from work_item_comments where project_id in (select id from projects where workspace_id = $1))"
            : spec.scope === "note"
              ? "t.note_id in (select id from project_notes where project_id in (select id from projects where workspace_id = $1))"
              : spec.scope === "ai_job"
                ? "t.job_id in (select id from ai_jobs where workspace_id = $1)"
                : spec.scope === "ai_execution"
                  ? "t.execution_id in (select id from ai_action_executions where workspace_id = $1)"
                  : spec.scope === "export"
                    ? "t.export_id in (select id from workspace_export_runs where workspace_id = $1)"
                    : "t.repository_id in (select id from engineering_repositories where workspace_id = $1)";
  const result = await client.query<{ record: unknown }>(
    `select to_jsonb(t) - array[${excluded}]::text[] as record from ${table} t where ${scope} order by to_jsonb(t)::text limit ${MAX_DATASET_ROWS + 1}`,
    [workspaceId, ...EXCLUDED_COLUMNS],
  );
  if (result.rows.length > MAX_DATASET_ROWS) {
    throw new Error("export_dataset_limit_exceeded");
  }
  return splitNdjson(
    `data/${spec.group}/${spec.table}`,
    result.rows.map((row) => row.record),
  );
}

function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "source";
}

async function readCommercialFiles(client: PoolClient, workspaceId: string) {
  const result = await client.query<{
    id: string;
    name: string;
    media_type: string;
    content_sha256: string;
    original_content: Buffer;
  }>(
    `select s.id, s.name, s.media_type, s.content_sha256, s.original_content
       from commercial_evidence_sources s
       join projects p on p.id = s.project_id
      where p.workspace_id = $1
      order by s.id
      limit ${MAX_DATASET_ROWS + 1}`,
    [workspaceId],
  );
  if (result.rows.length > MAX_DATASET_ROWS) {
    throw new Error("export_dataset_limit_exceeded");
  }
  return result.rows.map((row) => {
    const content = Buffer.from(row.original_content);
    if (sha256(content) !== row.content_sha256)
      throw new Error("export_source_hash_mismatch");
    return {
      name: `commercial-sources/${row.id}-${safeFileName(row.name)}`,
      content,
      sha256: row.content_sha256,
    } satisfies ExportEntry;
  });
}

async function readWorkspaceUsers(client: PoolClient, workspaceId: string) {
  const result = await client.query(
    `select distinct u.id, u.name, u.email, u.email_verified, u.created_at, u.updated_at
       from users u
       join memberships m on m.user_id = u.id
      where m.workspace_id = $1
      order by u.id
      limit ${MAX_DATASET_ROWS + 1}`,
    [workspaceId],
  );
  if (result.rows.length > MAX_DATASET_ROWS)
    throw new Error("export_dataset_limit_exceeded");
  return splitNdjson("data/workspace/users", result.rows);
}

function makeParts(
  entries: ExportEntry[],
  run: { id: string; workspaceId: string; createdAt: Date; expiresAt: Date },
) {
  const groups: ExportEntry[][] = [];
  let current: ExportEntry[] = [];
  let currentBytes = 0;
  for (const entry of entries) {
    const estimated = entry.content.length + 1024;
    if (current.length && currentBytes + estimated > TARGET_PART_BYTES) {
      groups.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(entry);
    currentBytes += estimated;
  }
  if (current.length) groups.push(current);
  if (!groups.length) groups.push([]);

  const catalog = entries.map((entry) => ({
    path: entry.name,
    byteSize: entry.content.length,
    sha256: entry.sha256,
  }));
  return groups.map((group, index) => {
    const manifest = Buffer.from(
      `${JSON.stringify({
        format: "scopedelta-operational-export",
        formatVersion: EXPORT_FORMAT_VERSION,
        legalArchive: false,
        pointInTimeArchive: false,
        exportId: run.id,
        workspaceId: run.workspaceId,
        createdAt: run.createdAt.toISOString(),
        expiresAt: run.expiresAt.toISOString(),
        partNumber: index + 1,
        partCount: groups.length,
        files: catalog,
        limitations: [
          "Operational open-format export; not a legal-retention archive.",
          "Shared identity data is limited to users who are members of this workspace.",
          "Authentication secrets, sessions, credentials, token hashes, and raw provider payloads are excluded.",
        ],
      })}\n`,
      "utf8",
    );
    const artifact = createDeterministicTarGz([
      { name: "manifest.v1.json", content: manifest },
      ...group.map(({ name, content }) => ({ name, content })),
    ]);
    if (artifact.length > MAX_PART_BYTES)
      throw new Error("export_part_too_large");
    return { artifact, sha256: sha256(artifact), byteSize: artifact.length };
  });
}

export async function createWorkspaceExport(
  actor: UserActor,
  workspaceId: string,
) {
  await requireWorkspaceOwner(actor, workspaceId);
  await consumeActionLimit(
    `workspace-export:create:${workspaceId}:${actor.userId}`,
    3,
    3600,
  );
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + EXPORT_TTL_MS);
  const client = await getPool().connect();
  try {
    await client.query(
      `insert into workspace_export_runs
        (id, workspace_id, requested_by_user_id, state, format_version, expires_at, created_at, updated_at)
       values ($1, $2, $3, 'building', $4, $5, $6, $6)`,
      [
        id,
        workspaceId,
        actor.userId,
        EXPORT_FORMAT_VERSION,
        expiresAt,
        createdAt,
      ],
    );
    try {
      await client.query("begin isolation level repeatable read");
      const entries: ExportEntry[] = [];
      for (const spec of DATASETS) {
        entries.push(...(await readDataset(client, workspaceId, spec)));
      }
      entries.push(...(await readWorkspaceUsers(client, workspaceId)));
      entries.push(...(await readCommercialFiles(client, workspaceId)));
      entries.sort((left, right) => left.name.localeCompare(right.name));
      const parts = makeParts(entries, {
        id,
        workspaceId,
        createdAt,
        expiresAt,
      });
      for (const [index, part] of parts.entries()) {
        await client.query(
          `insert into workspace_export_parts (export_id, part_number, byte_size, sha256, artifact)
           values ($1, $2, $3, $4, $5)`,
          [id, index + 1, part.byteSize, part.sha256, part.artifact],
        );
      }
      const manifestSha256 = sha256(
        entries.map((entry) => `${entry.name}:${entry.sha256}\n`).join(""),
      );
      const totalBytes = parts.reduce(
        (total, part) => total + part.byteSize,
        0,
      );
      await client.query(
        `update workspace_export_runs
            set state = 'ready', part_count = $2, total_bytes = $3,
                manifest_sha256 = $4, completed_at = now(), updated_at = now()
          where id = $1 and state = 'building'`,
        [id, parts.length, totalBytes, manifestSha256],
      );
      await client.query(
        `insert into audit_events
          (id, workspace_id, actor_type, actor_id, event_type, target_type, target_id, metadata)
         values ($1, $2, 'human', $3, 'workspace.export.created.v1', 'workspace_export_run', $4,
                 jsonb_build_object('formatVersion', $5::text, 'partCount', $6::text))`,
        [
          randomUUID(),
          workspaceId,
          actor.userId,
          id,
          EXPORT_FORMAT_VERSION,
          parts.length,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      const failureCode =
        error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)
          ? error.message
          : "export_build_failed";
      await client.query(
        `update workspace_export_runs
            set state = 'failed', failure_code = $2, completed_at = now(), updated_at = now()
          where id = $1 and state = 'building'`,
        [id, failureCode],
      );
      throw new PlatformError(
        failureCode,
        503,
        "The workspace export could not be built.",
      );
    }
  } finally {
    client.release();
  }
  return getWorkspaceExport(actor, workspaceId, id);
}

export async function getWorkspaceExport(
  actor: UserActor,
  workspaceId: string,
  exportId: string,
) {
  await requireWorkspaceOwner(actor, workspaceId);
  const result = await getPool().query<{
    id: string;
    state: "building" | "ready" | "failed";
    format_version: number;
    part_count: number;
    total_bytes: string;
    manifest_sha256: string | null;
    failure_code: string | null;
    expires_at: Date;
    completed_at: Date | null;
    created_at: Date;
  }>(
    `select id, state, format_version, part_count, total_bytes, manifest_sha256,
            failure_code, expires_at, completed_at, created_at
       from workspace_export_runs
      where id = $1 and workspace_id = $2
      limit 1`,
    [exportId, workspaceId],
  );
  if (!result.rows[0]) throw notFound();
  const run = result.rows[0];
  const parts = await getPool().query<{
    part_number: number;
    byte_size: number;
    sha256: string;
  }>(
    `select part_number, byte_size, sha256 from workspace_export_parts
      where export_id = $1 order by part_number`,
    [exportId],
  );
  return {
    id: run.id,
    state: run.state,
    formatVersion: run.format_version,
    partCount: run.part_count,
    totalBytes: Number(run.total_bytes),
    manifestSha256: run.manifest_sha256,
    failureCode: run.failure_code,
    expiresAt: run.expires_at,
    expired: run.expires_at.getTime() <= Date.now(),
    completedAt: run.completed_at,
    createdAt: run.created_at,
    scope: "operational-open-format-not-legal-archive" as const,
    parts: parts.rows.map((part) => ({
      partNumber: part.part_number,
      byteSize: part.byte_size,
      sha256: part.sha256,
    })),
  };
}

export async function downloadWorkspaceExportPart(
  actor: UserActor,
  workspaceId: string,
  exportId: string,
  partNumber: number,
) {
  await requireWorkspaceOwner(actor, workspaceId);
  await consumeActionLimit(
    `workspace-export:part:${workspaceId}:${actor.userId}`,
    60,
    3600,
  );
  const result = await getPool().query<{
    artifact: Buffer;
    byte_size: number;
    sha256: string;
    expires_at: Date;
    state: string;
  }>(
    `select p.artifact, p.byte_size, p.sha256, r.expires_at, r.state
       from workspace_export_parts p
       join workspace_export_runs r on r.id = p.export_id
      where r.id = $1 and r.workspace_id = $2 and p.part_number = $3
      limit 1`,
    [exportId, workspaceId, partNumber],
  );
  const part = result.rows[0];
  if (!part) throw notFound();
  if (part.state !== "ready")
    throw new PlatformError(
      "export_not_ready",
      409,
      "The export is not ready.",
    );
  if (part.expires_at.getTime() <= Date.now()) {
    throw new PlatformError(
      "export_expired",
      410,
      "This export has expired. Create a new export.",
    );
  }
  const artifact = Buffer.from(part.artifact);
  if (artifact.length !== part.byte_size || sha256(artifact) !== part.sha256) {
    throw new PlatformError(
      "export_integrity_failed",
      503,
      "The export part failed its integrity check.",
    );
  }
  return { artifact, sha256: part.sha256, byteSize: part.byte_size };
}
