import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { getPool } from "@/db";
import { PlatformError, notFound } from "@/lib/platform-errors";

export const PHYSICAL_PURGE_ERROR = "physical_purge_policy_required";

export type LifecycleOperatorAction =
  "inspect" | "start-review" | "block" | "process" | "purge";

type LifecycleRow = {
  id: string;
  workspace_id: string;
  intent: string;
  state: "requested" | "in_review" | "blocked" | "processed" | "canceled";
  operator_id: string | null;
  export_id: string | null;
  blocker_codes: string[];
  requested_at: Date;
  review_started_at: Date | null;
  processed_at: Date | null;
  canceled_at: Date | null;
  updated_at: Date;
};

async function findCompletedExport(client: PoolClient, workspaceId: string) {
  const result = await client.query<{ id: string }>(
    `select id from workspace_export_runs
      where workspace_id = $1 and state = 'ready' and expires_at > now()
      order by completed_at desc, id desc limit 1`,
    [workspaceId],
  );
  return result.rows[0]?.id ?? null;
}

async function lifecycleBlockers(client: PoolClient, workspaceId: string) {
  const exportId = await findCompletedExport(client, workspaceId);
  const result = await client.query<{
    subscription_blocked: boolean;
    ai_inflight: boolean;
    import_inflight: boolean;
    github_inflight: boolean;
    billing_inflight: boolean;
    email_inflight: boolean;
  }>(
    `select
      exists(select 1 from workspace_billing_states where workspace_id = $1 and status not in ('entry', 'expired')) as subscription_blocked,
      exists(select 1 from ai_jobs where workspace_id = $1 and status in ('queued', 'running')) as ai_inflight,
      exists(select 1 from migration_import_sessions where workspace_id = $1 and state = 'committing') as import_inflight,
      exists(
        select 1 from provider_webhook_deliveries d
        join engineering_repositories r on r.id = d.repository_id
        where r.workspace_id = $1 and d.state = 'processing'
      ) as github_inflight,
      exists(select 1 from billing_provider_events where workspace_id = $1 and state = 'processing')
        or exists(select 1 from billing_checkout_attempts where workspace_id = $1 and status in ('creating', 'pending')) as billing_inflight,
      exists(select 1 from workspace_invitations where workspace_id = $1 and email_delivery_state = 'pending')
        or exists(select 1 from client_collaboration_notifications where workspace_id = $1 and email_delivery_state = 'pending')
        or exists(
          select 1 from client_project_invitations i join projects p on p.id = i.project_id
          where p.workspace_id = $1 and i.email_delivery_state = 'pending'
        ) as email_inflight`,
    [workspaceId],
  );
  const row = result.rows[0];
  const blockers: string[] = [];
  if (!exportId) blockers.push("owner_export_required");
  if (row.subscription_blocked) blockers.push("managed_subscription_active");
  if (row.ai_inflight) blockers.push("ai_work_in_flight");
  if (row.import_inflight) blockers.push("import_work_in_flight");
  if (row.github_inflight) blockers.push("github_work_in_flight");
  if (row.billing_inflight) blockers.push("billing_work_in_flight");
  if (row.email_inflight) blockers.push("email_work_in_flight");
  return { blockers, exportId };
}

function publicLifecycle(row: LifecycleRow, blockers = row.blocker_codes) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    intent: row.intent,
    state: row.state,
    operatorId: row.operator_id,
    exportId: row.export_id,
    blockerCodes: blockers,
    requestedAt: row.requested_at,
    reviewStartedAt: row.review_started_at,
    processedAt: row.processed_at,
    canceledAt: row.canceled_at,
    updatedAt: row.updated_at,
    destructiveEffectsApplied: false,
  };
}

async function audit(
  client: PoolClient,
  row: LifecycleRow,
  operatorId: string,
  eventType: string,
  metadata: Record<string, string | string[]>,
) {
  await client.query(
    `insert into audit_events
      (id, workspace_id, actor_type, actor_id, event_type, target_type, target_id, metadata)
     values ($1, $2, 'operator', $3, $4, 'workspace_lifecycle_request', $5, $6::jsonb)`,
    [
      randomUUID(),
      row.workspace_id,
      operatorId,
      eventType,
      row.id,
      JSON.stringify(metadata),
    ],
  );
}

export async function processWorkspaceLifecycle(input: {
  operatorId: string;
  workspaceId: string;
  requestId: string;
  action: LifecycleOperatorAction;
}) {
  if (input.action === "purge") {
    throw new PlatformError(
      PHYSICAL_PURGE_ERROR,
      409,
      "Physical purge requires an approved legal-retention and deletion policy.",
    );
  }
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const selected = await client.query<LifecycleRow>(
      `select * from workspace_lifecycle_requests
        where id = $1 and workspace_id = $2 for update`,
      [input.requestId, input.workspaceId],
    );
    const row = selected.rows[0];
    if (!row) throw notFound();

    if (input.action === "inspect") {
      const current = await lifecycleBlockers(client, input.workspaceId);
      await client.query("commit");
      return {
        ...publicLifecycle(row, current.blockers),
        eligibleExportId: current.exportId,
      };
    }

    if (input.action === "start-review") {
      if (!["requested", "blocked"].includes(row.state)) {
        throw new PlatformError(
          "lifecycle_transition_invalid",
          409,
          "This request cannot enter review.",
        );
      }
      const updated = await client.query<LifecycleRow>(
        `update workspace_lifecycle_requests
            set state = 'in_review', operator_id = $3,
                review_started_at = coalesce(review_started_at, now()),
                blocker_codes = '[]'::jsonb, updated_at = now()
          where id = $1 and workspace_id = $2 and state in ('requested', 'blocked')
          returning *`,
        [input.requestId, input.workspaceId, input.operatorId],
      );
      if (!updated.rows[0])
        throw new PlatformError(
          "lifecycle_transition_conflict",
          409,
          "The request changed concurrently.",
        );
      await audit(
        client,
        updated.rows[0],
        input.operatorId,
        "workspace.lifecycle.review_started.v1",
        {},
      );
      await client.query("commit");
      return publicLifecycle(updated.rows[0]);
    }

    if (row.state !== "in_review") {
      throw new PlatformError(
        "lifecycle_transition_invalid",
        409,
        "Start review before this action.",
      );
    }
    if (row.operator_id !== input.operatorId) {
      throw new PlatformError(
        "lifecycle_operator_mismatch",
        409,
        "The reviewing operator does not match.",
      );
    }
    const current = await lifecycleBlockers(client, input.workspaceId);
    if (input.action === "block" && !current.blockers.length) {
      throw new PlatformError(
        "lifecycle_blockers_absent",
        409,
        "No current blocker prevents processing.",
      );
    }
    if (current.blockers.length) {
      const blocked = await client.query<LifecycleRow>(
        `update workspace_lifecycle_requests
            set state = 'blocked', blocker_codes = $3::jsonb, updated_at = now()
          where id = $1 and workspace_id = $2 and state = 'in_review'
          returning *`,
        [input.requestId, input.workspaceId, JSON.stringify(current.blockers)],
      );
      if (!blocked.rows[0])
        throw new PlatformError(
          "lifecycle_transition_conflict",
          409,
          "The request changed concurrently.",
        );
      await audit(
        client,
        blocked.rows[0],
        input.operatorId,
        "workspace.lifecycle.blocked.v1",
        {
          blockerCodes: current.blockers,
        },
      );
      await client.query("commit");
      return publicLifecycle(blocked.rows[0]);
    }
    if (input.action === "block") throw new Error("lifecycle_blockers_absent");
    const processed = await client.query<LifecycleRow>(
      `update workspace_lifecycle_requests
          set state = 'processed', export_id = $3, blocker_codes = '[]'::jsonb,
              processed_at = now(), updated_at = now()
        where id = $1 and workspace_id = $2 and state = 'in_review'
        returning *`,
      [input.requestId, input.workspaceId, current.exportId],
    );
    if (!processed.rows[0])
      throw new PlatformError(
        "lifecycle_transition_conflict",
        409,
        "The request changed concurrently.",
      );
    await audit(
      client,
      processed.rows[0],
      input.operatorId,
      "workspace.lifecycle.processed.v1",
      {
        exportId: current.exportId!,
        effect: "non_destructive_operational_completion",
      },
    );
    await client.query("commit");
    return publicLifecycle(processed.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
