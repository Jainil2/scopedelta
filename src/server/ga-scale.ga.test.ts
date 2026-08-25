import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import { createClient } from "@/server/delivery";
import { listPortfolio } from "@/server/operations";
import { createWorkspaceExport } from "@/server/workspace-export";
import { createWorkspace } from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error("GA proof requires the dedicated scopedelta_test database.");
}

const db = getDb();
const owner = {
  userId: "",
  email: "ga-scale-owner@example.test",
};
let workspaceId = "";
let clientId = "";

async function reset() {
  await db.execute(
    sql.raw(
      "truncate table users, workspaces, operator_alert_deliveries, action_rate_limits cascade",
    ),
  );
}

describe("SC-012 representative GA scale proof", () => {
  beforeAll(async () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "ga-scale-secret-at-least-thirty-two-characters",
    );
    await reset();
    owner.userId = randomUUID();
    await getPool().query(
      `insert into users (id, name, email, email_verified) values ($1, 'GA Scale Owner', $2, true)`,
      [owner.userId, owner.email],
    );
    const workspace = await createWorkspace(owner, { name: "GA Scale Proof" });
    workspaceId = workspace.id;
    const client = await createClient(owner, workspaceId, {
      name: "GA Scale Client",
      internalReference: null,
      summary: null,
    });
    clientId = client.id;

    await getPool().query(
      `with created as (
         insert into users (id, name, email, email_verified)
         select gen_random_uuid(), 'GA User ' || value,
                'ga-scale-' || value || '@example.test', true
           from generate_series(1, 499) value
         returning id
       )
       insert into memberships (id, workspace_id, user_id, role, status)
       select gen_random_uuid(), $1, id, 'member', 'active' from created`,
      [workspaceId],
    );
    await getPool().query(
      `insert into projects
        (id, workspace_id, client_id, key, name, lead_user_id, lifecycle,
         completed_at, archived_at, next_work_item_number)
       select gen_random_uuid(), $1, $2, 'GA-' || value, 'GA Project ' || value, $3,
              case when value % 5 = 0 then 'archived'::project_lifecycle
                   when value % 3 = 0 then 'completed'::project_lifecycle
                   else 'active'::project_lifecycle end,
              case when value % 3 = 0 then now() else null end,
              case when value % 5 = 0 then now() else null end,
              51
         from generate_series(1, 101) value`,
      [workspaceId, clientId, owner.userId],
    );
    await getPool().query(
      `insert into work_items
        (id, project_id, number, title, status, priority, purpose,
         assignee_user_id, estimate_points, sort_order)
       select gen_random_uuid(), p.id, item_number,
              'GA work item ' || item_number,
              (array['backlog','ready','in_progress','in_review','done']::work_item_status[])[1 + item_number % 5],
              (array['low','medium','high']::work_item_priority[])[1 + item_number % 3],
              'client_delivery', $1, 3, item_number
         from projects p cross join generate_series(1, 50) item_number
        where p.workspace_id = $2`,
      [owner.userId, workspaceId],
    );
    await getPool().query(
      `insert into project_allocations
        (id, workspace_id, project_id, member_user_id, start_week, end_week,
         planned_minutes_per_week, role_label, created_by_user_id, updated_by_user_id)
       select gen_random_uuid(), $1, id, $2, date '2026-08-24', date '2026-09-28',
              1200, 'delivery', $2, $2
         from projects where workspace_id = $1 order by id limit 100`,
      [workspaceId, owner.userId],
    );
    await getPool().query(
      `insert into delivery_time_entries
        (id, workspace_id, project_id, member_user_id, work_item_id, work_date,
         duration_minutes, classification, created_by_user_id, updated_by_user_id)
       select gen_random_uuid(), $1, w.project_id, $2, w.id, date '2026-08-25',
              60, 'billable', $2, $2
         from work_items w join projects p on p.id = w.project_id
        where p.workspace_id = $1 order by w.id limit 500`,
      [workspaceId, owner.userId],
    );
    const source = Buffer.from("GA commercial evidence", "utf8");
    await getPool().query(
      `insert into commercial_evidence_sources
        (id, project_id, idempotency_key, kind, name, media_type, byte_size,
         content_sha256, original_content, extracted_text, parse_state, created_by_user_id)
       select gen_random_uuid(), id, gen_random_uuid(), 'pasted_text',
              'ga-commercial.txt', 'text/plain', $1, $2, $3, $4, 'ready', $5
         from projects where workspace_id = $6 order by id limit 20`,
      [
        source.length,
        createHash("sha256").update(source).digest("hex"),
        source,
        source.toString("utf8"),
        owner.userId,
        workspaceId,
      ],
    );
    await getPool().query(
      `insert into client_project_participants
        (id, project_id, user_id, invited_email, role, created_by_user_id)
       select gen_random_uuid(), p.id, $1, $2, 'approver', $1
         from projects p where p.workspace_id = $3 order by p.id limit 20`,
      [owner.userId, owner.email, workspaceId],
    );
    await getPool().query(
      `with chosen as (
         select p.id project_id, c.id participant_id
           from projects p join client_project_participants c on c.project_id = p.id
          where p.workspace_id = $1 order by p.id limit 1
       ), milestone as (
         insert into milestones (id, project_id, name, status)
         select gen_random_uuid(), project_id, 'GA acceptance milestone', 'completed' from chosen
         returning id, project_id
       ), item as (
         insert into client_project_items
           (id, project_id, idempotency_key, target, milestone_id, client_summary, created_by_user_id)
         select gen_random_uuid(), project_id, gen_random_uuid(), 'milestone', id,
                'GA acceptance summary', $2 from milestone
         returning id, project_id
       ), target as (
         insert into client_acceptance_targets
           (id, project_id, project_item_id, idempotency_key, version_number,
            snapshot_title, snapshot_summary, snapshot_status, published_by_user_id)
         select gen_random_uuid(), project_id, id, gen_random_uuid(), 1,
                'GA acceptance', 'GA acceptance evidence', 'completed', $2 from item
         returning id, project_id
       )
       insert into client_acceptance_actions
         (id, project_id, acceptance_target_id, participant_id, idempotency_key, action)
       select gen_random_uuid(), t.project_id, t.id, c.participant_id,
              gen_random_uuid(), 'accepted'
         from target t join chosen c on c.project_id = t.project_id`,
      [workspaceId, owner.userId],
    );
    await getPool().query(
      `insert into verification_records
        (id, project_id, work_item_id, method, category, result,
         subject_fingerprint, recorded_by_user_id)
       select gen_random_uuid(), w.project_id, w.id, 'automated_reference',
              'ga-regression', 'passed', encode(sha256(w.id::text::bytea), 'hex'), $1
         from work_items w join projects p on p.id = w.project_id
        where p.workspace_id = $2 order by w.id limit 250`,
      [owner.userId, workspaceId],
    );
    await getPool().query(
      `insert into migration_import_sessions
        (id, workspace_id, source_kind, source_namespace, source_name, file_name,
         file_sha256, state, mapping, options, unsupported_columns, total_rows,
         valid_rows, warning_rows, blocked_rows, created_projects, created_work_items,
         skipped_rows, failed_rows, committed_anything, created_by_user_id,
         confirmed_by_user_id, confirmed_at, completed_at)
       values (gen_random_uuid(), $1, 'generic_csv', 'ga-proof', 'GA proof',
               'ga.csv', $2, 'completed', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
               5000, 5000, 0, 0, 101, 5050, 0, 0, true, $3, $3, now(), now())`,
      [workspaceId, "0".repeat(64), owner.userId],
    );
    await getPool().query(
      `insert into workspace_product_signals
        (id, workspace_id, event_type, outcome, dimension, occurrence_count)
       values (gen_random_uuid(), $1, 'provider_delivery', 'failed', 'provider_unavailable', 4)`,
      [workspaceId],
    );
    await getPool().query(
      `insert into provider_webhook_deliveries
        (id, provider, delivery_id, event_name, state, error_code, processed_at)
       values (gen_random_uuid(), 'github', 'ga-scale-delivery', 'pull_request',
               'failed', 'provider_unavailable', now())`,
    );
    await getPool().query(
      `insert into ai_jobs
        (id, workspace_id, project_id, created_by_user_id, kind, status,
         idempotency_key, prompt_version, context_snapshot, evidence_map,
         context_fingerprint, result, provider, model, provider_base_url,
         execution_config_fingerprint, completed_at)
       select gen_random_uuid(), $1, id, $2, 'delivery_risk_brief', 'succeeded',
              gen_random_uuid(), 'ga-v1', '{}'::jsonb, '{}'::jsonb,
              'ga-scale-context', '{}'::jsonb, 'fake', 'fake',
              'http://127.0.0.1', 'ga-scale-config', now()
         from projects where workspace_id = $1 order by id limit 1`,
      [workspaceId, owner.userId],
    );
    await getPool().query(
      `insert into workspace_lifecycle_requests
        (id, workspace_id, intent, state, requested_by_user_id)
       values (gen_random_uuid(), $1, 'closure', 'requested', $2)`,
      [workspaceId, owner.userId],
    );
    await getPool().query("analyze");
  });

  afterAll(async () => {
    if (process.env.GA_PRESERVE_FIXTURE !== "true") await reset();
    vi.unstubAllEnvs();
    await getPool().end();
  });

  it("holds the representative 500-person / 100-project / 5,000-work-item fixture", async () => {
    const counts = await getPool().query<{
      users: string;
      projects: string;
      work_items: string;
      allocations: string;
      time_entries: string;
      commercial: string;
      client_evidence: string;
      qa: string;
      imports: string;
    }>(
      `select
        (select count(*) from memberships where workspace_id = $1)::text users,
        (select count(*) from projects where workspace_id = $1)::text projects,
        (select count(*) from work_items w join projects p on p.id = w.project_id where p.workspace_id = $1)::text work_items,
        (select count(*) from project_allocations where workspace_id = $1)::text allocations,
        (select count(*) from delivery_time_entries where workspace_id = $1)::text time_entries,
        (select count(*) from commercial_evidence_sources s join projects p on p.id = s.project_id where p.workspace_id = $1)::text commercial,
        (select count(*) from client_project_participants c join projects p on p.id = c.project_id where p.workspace_id = $1)::text client_evidence,
        (select count(*) from verification_records v join projects p on p.id = v.project_id where p.workspace_id = $1)::text qa,
        (select count(*) from migration_import_sessions where workspace_id = $1)::text imports`,
      [workspaceId],
    );
    expect(counts.rows[0]).toEqual({
      users: "500",
      projects: "101",
      work_items: "5050",
      allocations: "100",
      time_entries: "500",
      commercial: "20",
      client_evidence: "20",
      qa: "250",
      imports: "1",
    });
  });

  it("keeps material portfolio and work queries bounded and index-backed", async () => {
    const portfolio = await listPortfolio(owner, workspaceId, {
      lifecycle: "all",
      page: 1,
      pageSize: 25,
    });
    expect(portfolio.items).toHaveLength(25);
    expect(portfolio.page.total).toBe(101);
    const project = await getPool().query<{ id: string }>(
      `select id from projects where workspace_id = $1 order by id limit 1`,
      [workspaceId],
    );
    const plan = await getPool().query(
      `explain (analyze, format json)
       select id from work_items
        where project_id = $1 and status = 'in_progress'
        order by sort_order, id limit 100`,
      [project.rows[0]!.id],
    );
    const serialized = JSON.stringify(plan.rows);
    expect(serialized).toContain("work_items_project_status_order_idx");
    expect(serialized).not.toContain('"Node Type":"Seq Scan"');
  });

  it("exports the scale fixture without an unbounded response", async () => {
    const result = await createWorkspaceExport(owner, workspaceId);
    expect(result.parts.length).toBeGreaterThan(0);
    expect(result.parts.every((part) => part.byteSize < 15 * 1024 * 1024)).toBe(
      true,
    );
  });
});
