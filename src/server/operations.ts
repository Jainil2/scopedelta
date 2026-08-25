import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  clientAcceptanceActions,
  clientAcceptanceTargets,
  clientCommercialPacketActions,
  clientCommercialPackets,
  clients,
  commercialDecisions,
  commercialRequests,
  defects,
  deliveryTimeEntries,
  implementationArtifacts,
  memberDeliveryAvailabilityPeriods,
  memberships,
  milestones,
  projectAllocations,
  projectMemberships,
  projects,
  users,
  workItems,
  workspaceDeliveryAvailabilityPeriods,
  workspaceSettings,
  workspaces,
} from "@/db/schema";
import {
  addIsoDays,
  dateInTimeZone,
  DEFAULT_WEEKLY_DELIVERY_MINUTES,
  enumerateIsoWeeks,
  isoWeekStart,
  type CommercialExposureSummary,
  type PortfolioAttentionCategory,
} from "@/lib/operations";
import type {
  AllocationInput,
  AvailabilityInput,
  CapacityFilters,
  PortfolioFilters,
  TimeEntryFilters,
  TimeEntryInput,
  UpdateAllocationInput,
  UpdateTimeEntryInput,
} from "@/lib/operations-validation";
import { PlatformError, forbidden, notFound } from "@/lib/platform-errors";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
  insertAudit,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";

type WorkspaceAccess = {
  role: "owner" | "admin" | "member";
  slug: string;
  timezone: string;
};

type PortfolioSignalRow = {
  project_id: string;
  category: PortfolioAttentionCategory;
  total: number;
};

async function getWorkspaceOperationsAccess(
  actor: UserActor,
  workspaceId: string,
): Promise<WorkspaceAccess> {
  const rows = await getDb()
    .select({
      role: memberships.role,
      slug: workspaces.slug,
      timezone: workspaceSettings.timezone,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .innerJoin(
      workspaceSettings,
      eq(workspaceSettings.workspaceId, memberships.workspaceId),
    )
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, actor.userId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

function assertWorkspaceManager(access: WorkspaceAccess) {
  if (access.role === "member") throw forbidden();
}

function projectManagerCondition(actor: UserActor, access: WorkspaceAccess) {
  return access.role === "member"
    ? eq(projects.leadUserId, actor.userId)
    : undefined;
}

function accessibleProjectCondition(actor: UserActor, access: WorkspaceAccess) {
  if (access.role !== "member") return undefined;
  return or(
    eq(projects.leadUserId, actor.userId),
    sql`exists (
      select 1 from ${projectMemberships} access_membership
      where access_membership.project_id = ${projects.id}
        and access_membership.user_id = ${actor.userId}
    )`,
  );
}

function isCommercialAttentionCategory(category: PortfolioAttentionCategory) {
  return (
    category === "client_request" ||
    category === "commercial_drift" ||
    category === "pending_commercial_decision"
  );
}

function attentionExists(category: PortfolioAttentionCategory) {
  switch (category) {
    case "overdue_milestone":
      return sql`exists (
        select 1 from ${milestones} signal_milestone
        where signal_milestone.project_id = ${projects.id}
          and signal_milestone.archived_at is null
          and signal_milestone.status in ('planned', 'in_progress')
          and signal_milestone.target_date < current_date
      )`;
    case "client_request":
      return sql`exists (
        select 1 from ${commercialRequests} signal_request
        where signal_request.project_id = ${projects.id}
          and signal_request.state in ('open', 'needs_clarification')
      )`;
    case "commercial_drift":
      return sql`exists (
        select 1 from ${workItems} signal_work
        where signal_work.project_id = ${projects.id}
          and signal_work.archived_at is null
          and signal_work.status not in ('done', 'canceled')
          and signal_work.purpose = 'client_delivery'
          and not exists (
            select 1
            from commercial_basis_links basis
            left join commercial_scope_item_revisions revision
              on revision.id = basis.scope_item_revision_id
              and revision.project_id = basis.project_id
            left join commercial_scope_items scope_item
              on scope_item.id = revision.scope_item_id
              and scope_item.project_id = basis.project_id
            left join commercial_decisions decision
              on decision.id = basis.decision_id
              and decision.project_id = basis.project_id
            where basis.work_item_id = signal_work.id
              and basis.project_id = signal_work.project_id
              and (
                (basis.basis_type = 'commercial_decision'
                  and decision.superseded_at is null
                  and decision.disposition in ('covered', 'absorbed', 'swap', 'paid_change'))
                or
                (basis.basis_type = 'baseline_scope_item' and exists (
                  select 1 from commercial_scope_items current_scope
                  inner join commercial_baseline_versions current_version
                    on current_version.id = current_scope.baseline_version_id
                    and current_version.project_id = current_scope.project_id
                  where current_scope.project_id = signal_work.project_id
                    and current_scope.material_basis_scope_item_id = scope_item.material_basis_scope_item_id
                    and current_scope.archived_at is null
                    and current_version.state = 'effective'
                ))
              )
          )
      )`;
    case "blocked_work":
      return sql`exists (
        select 1 from work_item_dependencies dependency
        inner join work_items blocked on blocked.id = dependency.blocked_work_item_id
        inner join work_items blocker on blocker.id = dependency.blocker_work_item_id
        where dependency.project_id = ${projects.id}
          and blocked.archived_at is null
          and blocker.archived_at is null
          and blocked.status not in ('done', 'canceled')
          and blocker.status not in ('done', 'canceled')
      )`;
    case "evidence_gap":
      return sql`exists (
        select 1 from ${workItems} evidence_work
        where evidence_work.project_id = ${projects.id}
          and evidence_work.archived_at is null
          and evidence_work.status not in ('done', 'canceled')
          and evidence_work.purpose = 'client_delivery'
          and (
            not exists (
              select 1 from work_implementation_links evidence_link
              where evidence_link.work_item_id = evidence_work.id
                and evidence_link.removed_at is null
            )
            or exists (
              select 1 from work_implementation_links evidence_link
              inner join implementation_artifacts evidence_artifact
                on evidence_artifact.id = evidence_link.artifact_id
              where evidence_link.work_item_id = evidence_work.id
                and evidence_link.removed_at is null
                and (evidence_artifact.stale_at is not null
                  or evidence_artifact.check_rollup in ('failing', 'pending', 'unknown'))
            )
            or not exists (
              select 1 from verification_records verification
              where verification.work_item_id = evidence_work.id
                and verification.result = 'passed'
            )
          )
      )`;
    case "unresolved_defect":
      return sql`exists (
        select 1 from ${defects} signal_defect
        where signal_defect.project_id = ${projects.id}
          and signal_defect.status = 'open'
      )`;
    case "pending_commercial_decision":
      return sql`exists (
        select 1 from ${commercialRequests} pending_request
        left join ${commercialDecisions} pending_decision
          on pending_decision.request_id = pending_request.id
          and pending_decision.superseded_at is null
        left join ${clientCommercialPackets} pending_packet
          on pending_packet.request_id = pending_request.id
          and pending_packet.superseded_at is null
        left join ${clientCommercialPacketActions} pending_action
          on pending_action.packet_id = pending_packet.id
        where pending_request.project_id = ${projects.id}
          and (
            (pending_request.state in ('open', 'needs_clarification') and pending_decision.id is null)
            or (pending_packet.requirement = 'approval'
              and pending_action.action is distinct from 'approved')
          )
      )`;
    case "pending_acceptance":
      return sql`exists (
        select 1 from ${clientAcceptanceTargets} pending_target
        left join ${clientAcceptanceActions} acceptance_action
          on acceptance_action.acceptance_target_id = pending_target.id
        where pending_target.project_id = ${projects.id}
          and pending_target.superseded_at is null
          and acceptance_action.action is distinct from 'accepted'
      )`;
    case "stale_provider_evidence":
      return sql`exists (
        select 1 from work_implementation_links stale_link
        inner join ${implementationArtifacts} stale_artifact
          on stale_artifact.id = stale_link.artifact_id
        inner join ${workItems} stale_work on stale_work.id = stale_link.work_item_id
        where stale_link.project_id = ${projects.id}
          and stale_link.removed_at is null
          and stale_artifact.stale_at is not null
          and stale_work.archived_at is null
          and stale_work.status not in ('done', 'canceled')
      )`;
  }
}

export async function listPortfolio(
  actor: UserActor,
  workspaceId: string,
  filters: PortfolioFilters,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  const conditions = [eq(projects.workspaceId, workspaceId)];
  const accessible = accessibleProjectCondition(actor, access);
  if (accessible) conditions.push(accessible);
  if (filters.lifecycle !== "all")
    conditions.push(eq(projects.lifecycle, filters.lifecycle));
  if (filters.clientId)
    conditions.push(eq(projects.clientId, filters.clientId));
  if (filters.personId) {
    conditions.push(
      or(
        eq(projects.leadUserId, filters.personId),
        sql`exists (
          select 1 from ${projectMemberships} person_membership
          where person_membership.project_id = ${projects.id}
            and person_membership.user_id = ${filters.personId}
        )`,
      )!,
    );
  }
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(projects.key, pattern),
        ilike(projects.name, pattern),
        ilike(clients.name, pattern),
      )!,
    );
  }
  if (filters.attention) {
    conditions.push(attentionExists(filters.attention));
    if (
      access.role === "member" &&
      isCommercialAttentionCategory(filters.attention)
    ) {
      conditions.push(eq(projects.leadUserId, actor.userId));
    }
  }
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        lifecycle: projects.lifecycle,
        targetDate: projects.targetDate,
        clientId: clients.id,
        clientName: clients.name,
        leadUserId: users.id,
        leadName: users.name,
        nextMilestoneId: sql<string | null>`(
          select next_milestone.id from ${milestones} next_milestone
          where next_milestone.project_id = ${projects.id}
            and next_milestone.archived_at is null
            and next_milestone.status in ('planned', 'in_progress')
          order by next_milestone.target_date asc nulls last, next_milestone.sort_order, next_milestone.id
          limit 1
        )`,
        nextMilestoneName: sql<string | null>`(
          select next_milestone.name from ${milestones} next_milestone
          where next_milestone.project_id = ${projects.id}
            and next_milestone.archived_at is null
            and next_milestone.status in ('planned', 'in_progress')
          order by next_milestone.target_date asc nulls last, next_milestone.sort_order, next_milestone.id
          limit 1
        )`,
        nextMilestoneTargetDate: sql<string | null>`(
          select next_milestone.target_date from ${milestones} next_milestone
          where next_milestone.project_id = ${projects.id}
            and next_milestone.archived_at is null
            and next_milestone.status in ('planned', 'in_progress')
          order by next_milestone.target_date asc nulls last, next_milestone.sort_order, next_milestone.id
          limit 1
        )`,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .innerJoin(users, eq(users.id, projects.leadUserId))
      .where(where)
      .orderBy(asc(projects.targetDate), asc(projects.name), asc(projects.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(where),
  ]);
  const signalRows = await portfolioSignals(rows.map((row) => row.id));
  const signalsByProject = new Map<string, PortfolioSignalRow[]>();
  for (const signal of signalRows) {
    const values = signalsByProject.get(signal.project_id) ?? [];
    values.push(signal);
    signalsByProject.set(signal.project_id, values);
  }
  return {
    items: rows.map((row) => {
      const canViewCommercial =
        access.role !== "member" || row.leadUserId === actor.userId;
      return {
        ...row,
        canViewCommercial,
        signals: (signalsByProject.get(row.id) ?? [])
          .filter(
            (signal) =>
              canViewCommercial ||
              !isCommercialAttentionCategory(signal.category),
          )
          .map((signal) => ({
            category: signal.category,
            count: Number(signal.total),
            href: attentionHref(access.slug, row.key, signal.category),
          })),
      };
    }),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

async function portfolioSignals(projectIds: string[]) {
  if (!projectIds.length) return [] as PortfolioSignalRow[];
  const ids = sql.join(
    projectIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const result = await getDb().execute<PortfolioSignalRow>(sql`
    with signals as (
      select milestone.project_id, 'overdue_milestone'::text category, milestone.id source_id
      from milestones milestone
      where milestone.project_id in (${ids}) and milestone.archived_at is null
        and milestone.status in ('planned', 'in_progress') and milestone.target_date < current_date
      union all
      select request.project_id, 'client_request', request.id
      from commercial_requests request
      where request.project_id in (${ids}) and request.state in ('open', 'needs_clarification')
      union all
      select dependency.project_id, 'blocked_work', dependency.blocked_work_item_id
      from work_item_dependencies dependency
      inner join work_items blocked on blocked.id = dependency.blocked_work_item_id
      inner join work_items blocker on blocker.id = dependency.blocker_work_item_id
      where dependency.project_id in (${ids}) and blocked.archived_at is null
        and blocker.archived_at is null and blocked.status not in ('done', 'canceled')
        and blocker.status not in ('done', 'canceled')
      union all
      select defect.project_id, 'unresolved_defect', defect.id
      from defects defect where defect.project_id in (${ids}) and defect.status = 'open'
      union all
      select target.project_id, 'pending_acceptance', target.id
      from client_acceptance_targets target
      left join client_acceptance_actions action on action.acceptance_target_id = target.id
      where target.project_id in (${ids}) and target.superseded_at is null
        and action.action is distinct from 'accepted'
      union all
      select artifact.project_id, 'stale_provider_evidence', artifact.id
      from implementation_artifacts artifact
      where artifact.project_id in (${ids}) and artifact.stale_at is not null
        and exists (
          select 1 from work_implementation_links link
          inner join work_items linked_work on linked_work.id = link.work_item_id
          where link.artifact_id = artifact.id and link.removed_at is null
            and linked_work.archived_at is null and linked_work.status not in ('done', 'canceled')
        )
    )
    select project_id, category, count(distinct source_id)::int total
    from signals group by project_id, category
    union all
    select projects.id, category.category, 1
    from projects
    cross join lateral (values
      ('commercial_drift'::text), ('evidence_gap'::text), ('pending_commercial_decision'::text)
    ) category(category)
    where projects.id in (${ids}) and (
      (category.category = 'commercial_drift' and ${attentionExists("commercial_drift")})
      or (category.category = 'evidence_gap' and ${attentionExists("evidence_gap")})
      or (category.category = 'pending_commercial_decision' and ${attentionExists("pending_commercial_decision")})
    )
  `);
  return result.rows;
}

function attentionHref(
  workspaceSlug: string,
  projectKey: string,
  category: PortfolioAttentionCategory,
) {
  const base = `/app/${workspaceSlug}/projects/${projectKey}`;
  switch (category) {
    case "overdue_milestone":
      return `${base}#milestones`;
    case "client_request":
      return `${base}/commercial?requestState=open#requests`;
    case "commercial_drift":
      return `${base}/commercial?drift=commercially_unlinked#commercial-drift`;
    case "blocked_work":
      return `${base}/backlog?blocked=true`;
    case "evidence_gap":
      return `${base}/engineering#readiness`;
    case "unresolved_defect":
      return `${base}/engineering#defects`;
    case "pending_commercial_decision":
      return `${base}/client#commercial-decisions`;
    case "pending_acceptance":
      return `${base}/client#delivery-acceptance`;
    case "stale_provider_evidence":
      return `${base}/engineering#provider-evidence`;
  }
}

export async function setWorkspaceAvailability(
  actor: UserActor,
  workspaceId: string,
  input: AvailabilityInput,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  assertWorkspaceManager(access);
  assertAvailabilityNotHistorical(input.effectiveFrom, access.timezone);
  return getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from ${workspaces} where id = ${workspaceId} for update`,
    );
    const periods = await transaction
      .select({
        id: workspaceDeliveryAvailabilityPeriods.id,
        effectiveFrom: workspaceDeliveryAvailabilityPeriods.effectiveFrom,
      })
      .from(workspaceDeliveryAvailabilityPeriods)
      .where(
        and(eq(workspaceDeliveryAvailabilityPeriods.workspaceId, workspaceId)),
      )
      .orderBy(asc(workspaceDeliveryAvailabilityPeriods.effectiveFrom));
    const exact = periods.find(
      (period) => period.effectiveFrom === input.effectiveFrom,
    );
    if (exact) {
      await transaction
        .update(workspaceDeliveryAvailabilityPeriods)
        .set({
          weeklyMinutes: input.weeklyMinutes,
          updatedAt: new Date(),
        })
        .where(eq(workspaceDeliveryAvailabilityPeriods.id, exact.id));
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "operations.workspace_availability.changed.v1",
        targetType: "workspace_delivery_availability",
        targetId: exact.id,
        metadata: {
          effectiveFrom: input.effectiveFrom,
          weeklyMinutes: String(input.weeklyMinutes),
        },
      });
      return { id: exact.id, ...input };
    }
    const preceding = periods
      .filter((period) => period.effectiveFrom < input.effectiveFrom)
      .at(-1);
    const following = periods.find(
      (period) => period.effectiveFrom > input.effectiveFrom,
    );
    if (preceding) {
      await transaction
        .update(workspaceDeliveryAvailabilityPeriods)
        .set({
          effectiveTo: addIsoDays(input.effectiveFrom, -1),
          updatedAt: new Date(),
        })
        .where(eq(workspaceDeliveryAvailabilityPeriods.id, preceding.id));
    }
    const id = randomUUID();
    await transaction.insert(workspaceDeliveryAvailabilityPeriods).values({
      id,
      workspaceId,
      weeklyMinutes: input.weeklyMinutes,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: following ? addIsoDays(following.effectiveFrom, -1) : null,
      createdByUserId: actor.userId,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.workspace_availability.changed.v1",
      targetType: "workspace_delivery_availability",
      targetId: id,
      metadata: {
        effectiveFrom: input.effectiveFrom,
        weeklyMinutes: String(input.weeklyMinutes),
      },
    });
    return { id, ...input };
  });
}

export async function setMemberAvailability(
  actor: UserActor,
  workspaceId: string,
  memberUserId: string,
  input: AvailabilityInput,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  assertWorkspaceManager(access);
  assertAvailabilityNotHistorical(input.effectiveFrom, access.timezone);
  return getDb().transaction(async (transaction) => {
    const memberRows = await transaction.execute<{ id: string }>(sql`
      select id from ${memberships}
      where workspace_id = ${workspaceId} and user_id = ${memberUserId}
      for update
    `);
    if (!memberRows.rows[0]) throw notFound();
    const periods = await transaction
      .select({
        id: memberDeliveryAvailabilityPeriods.id,
        effectiveFrom: memberDeliveryAvailabilityPeriods.effectiveFrom,
      })
      .from(memberDeliveryAvailabilityPeriods)
      .where(
        and(
          eq(memberDeliveryAvailabilityPeriods.workspaceId, workspaceId),
          eq(memberDeliveryAvailabilityPeriods.userId, memberUserId),
        ),
      )
      .orderBy(asc(memberDeliveryAvailabilityPeriods.effectiveFrom));
    const exact = periods.find(
      (period) => period.effectiveFrom === input.effectiveFrom,
    );
    if (exact) {
      await transaction
        .update(memberDeliveryAvailabilityPeriods)
        .set({
          weeklyMinutes: input.weeklyMinutes,
          updatedAt: new Date(),
        })
        .where(eq(memberDeliveryAvailabilityPeriods.id, exact.id));
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "operations.member_availability.changed.v1",
        targetType: "member_delivery_availability",
        targetId: exact.id,
        metadata: {
          memberUserId,
          effectiveFrom: input.effectiveFrom,
          weeklyMinutes: String(input.weeklyMinutes),
        },
      });
      return { id: exact.id, memberUserId, ...input };
    }
    const preceding = periods
      .filter((period) => period.effectiveFrom < input.effectiveFrom)
      .at(-1);
    const following = periods.find(
      (period) => period.effectiveFrom > input.effectiveFrom,
    );
    if (preceding) {
      await transaction
        .update(memberDeliveryAvailabilityPeriods)
        .set({
          effectiveTo: addIsoDays(input.effectiveFrom, -1),
          updatedAt: new Date(),
        })
        .where(eq(memberDeliveryAvailabilityPeriods.id, preceding.id));
    }
    const id = randomUUID();
    await transaction.insert(memberDeliveryAvailabilityPeriods).values({
      id,
      workspaceId,
      userId: memberUserId,
      weeklyMinutes: input.weeklyMinutes,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: following ? addIsoDays(following.effectiveFrom, -1) : null,
      createdByUserId: actor.userId,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.member_availability.changed.v1",
      targetType: "member_delivery_availability",
      targetId: id,
      metadata: {
        memberUserId,
        effectiveFrom: input.effectiveFrom,
        weeklyMinutes: String(input.weeklyMinutes),
      },
    });
    return { id, memberUserId, ...input };
  });
}

function assertAvailabilityNotHistorical(
  effectiveFrom: string,
  timezone: string,
) {
  const currentWeek = isoWeekStart(dateInTimeZone(new Date(), timezone));
  if (effectiveFrom < currentWeek) {
    throw conflict(
      "availability_history_locked",
      "Availability changes must start in the current or a future week.",
    );
  }
}

export async function createAllocation(
  actor: UserActor,
  workspaceId: string,
  input: AllocationInput,
) {
  return getDb().transaction(async (transaction) => {
    const access = await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      input.projectId,
    );
    assertProjectManager(access, actor.userId);
    const member = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, input.memberUserId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!member[0]) throw notFound();
    const id = randomUUID();
    await transaction.insert(projectAllocations).values({
      id,
      workspaceId,
      ...input,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.allocation.created.v1",
      targetType: "project_allocation",
      targetId: id,
      metadata: {
        projectId: input.projectId,
        memberUserId: input.memberUserId,
        startWeek: input.startWeek,
        endWeek: input.endWeek,
        plannedMinutesPerWeek: String(input.plannedMinutesPerWeek),
      },
    });
    return { id, ...input };
  });
}

export async function updateAllocation(
  actor: UserActor,
  workspaceId: string,
  allocationId: string,
  input: UpdateAllocationInput,
) {
  return getDb().transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(projectAllocations)
      .where(
        and(
          eq(projectAllocations.id, allocationId),
          eq(projectAllocations.workspaceId, workspaceId),
          isNull(projectAllocations.deletedAt),
        ),
      )
      .limit(1);
    const current = rows[0];
    if (!current) throw notFound();
    const projectId = input.projectId ?? current.projectId;
    const currentAccess = await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      current.projectId,
    );
    assertProjectManager(currentAccess, actor.userId);
    const access = await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    assertProjectManager(access, actor.userId);
    const memberUserId = input.memberUserId ?? current.memberUserId;
    const member = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, memberUserId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!member[0]) throw notFound();
    const next = { ...current, ...input };
    if (next.startWeek > next.endWeek) {
      throw conflict(
        "allocation_date_order",
        "End week must follow start week.",
      );
    }
    await transaction
      .update(projectAllocations)
      .set({ ...input, updatedByUserId: actor.userId, updatedAt: new Date() })
      .where(eq(projectAllocations.id, allocationId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.allocation.updated.v1",
      targetType: "project_allocation",
      targetId: allocationId,
      metadata: { projectId },
    });
    return { ...next, updatedByUserId: actor.userId };
  });
}

export async function deleteAllocation(
  actor: UserActor,
  workspaceId: string,
  allocationId: string,
) {
  return getDb().transaction(async (transaction) => {
    const rows = await transaction
      .select({ projectId: projectAllocations.projectId })
      .from(projectAllocations)
      .where(
        and(
          eq(projectAllocations.id, allocationId),
          eq(projectAllocations.workspaceId, workspaceId),
          isNull(projectAllocations.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) throw notFound();
    const access = await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      rows[0].projectId,
    );
    assertProjectManager(access, actor.userId);
    await transaction
      .update(projectAllocations)
      .set({
        deletedAt: new Date(),
        deletedByUserId: actor.userId,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(projectAllocations.id, allocationId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.allocation.deleted.v1",
      targetType: "project_allocation",
      targetId: allocationId,
      metadata: { projectId: rows[0].projectId },
    });
    return { deleted: true };
  });
}

export async function listAllocations(
  actor: UserActor,
  workspaceId: string,
  filters: CapacityFilters,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  if (filters.projectId) {
    await getProjectAccess(getDb(), actor, workspaceId, filters.projectId);
  }
  const conditions = [
    eq(projectAllocations.workspaceId, workspaceId),
    isNull(projectAllocations.deletedAt),
  ];
  if (filters.memberId)
    conditions.push(eq(projectAllocations.memberUserId, filters.memberId));
  if (filters.projectId)
    conditions.push(eq(projectAllocations.projectId, filters.projectId));
  if (access.role === "member") {
    conditions.push(
      or(
        eq(projectAllocations.memberUserId, actor.userId),
        eq(projects.leadUserId, actor.userId),
      )!,
    );
  }
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: projectAllocations.id,
        memberUserId: projectAllocations.memberUserId,
        memberName: users.name,
        projectId: projectAllocations.projectId,
        projectKey: projects.key,
        projectName: projects.name,
        leadUserId: projects.leadUserId,
        startWeek: projectAllocations.startWeek,
        endWeek: projectAllocations.endWeek,
        plannedMinutesPerWeek: projectAllocations.plannedMinutesPerWeek,
        roleLabel: projectAllocations.roleLabel,
      })
      .from(projectAllocations)
      .innerJoin(projects, eq(projects.id, projectAllocations.projectId))
      .innerJoin(users, eq(users.id, projectAllocations.memberUserId))
      .where(where)
      .orderBy(
        asc(projectAllocations.startWeek),
        asc(projects.name),
        asc(users.name),
        asc(projectAllocations.id),
      )
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(projectAllocations)
      .innerJoin(projects, eq(projects.id, projectAllocations.projectId))
      .where(where),
  ]);
  return {
    items: rows.map(({ leadUserId, ...row }) => ({
      ...row,
      canManage: access.role !== "member" || leadUserId === actor.userId,
    })),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

export async function listCapacity(
  actor: UserActor,
  workspaceId: string,
  filters: CapacityFilters,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  if (filters.projectId) {
    await getProjectAccess(getDb(), actor, workspaceId, filters.projectId);
  }
  const startWeek =
    filters.startWeek ??
    isoWeekStart(dateInTimeZone(new Date(), access.timezone));
  const weeks = enumerateIsoWeeks(startWeek, filters.weeks);
  const endWeek = weeks.at(-1) ?? startWeek;
  const memberConditions = [
    eq(memberships.workspaceId, workspaceId),
    eq(memberships.status, "active"),
  ];
  if (filters.memberId)
    conditionsPush(memberConditions, eq(users.id, filters.memberId));
  if (filters.query)
    conditionsPush(memberConditions, ilike(users.name, `%${filters.query}%`));
  if (access.role === "member") {
    memberConditions.push(
      or(
        eq(users.id, actor.userId),
        sql`exists (
          select 1 from ${projectAllocations} visible_allocation
          inner join ${projects} led_project on led_project.id = visible_allocation.project_id
          where visible_allocation.workspace_id = ${workspaceId}
            and visible_allocation.member_user_id = ${users.id}
            and visible_allocation.deleted_at is null
            and led_project.lead_user_id = ${actor.userId}
        )`,
      )!,
    );
  }
  const [memberRows, totalRows] = await Promise.all([
    getDb()
      .select({ id: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(...memberConditions))
      .orderBy(asc(users.name), asc(users.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(...memberConditions)),
  ]);
  const memberIds = memberRows.map((member) => member.id);
  if (!memberIds.length) {
    const total = totalRows[0]?.total ?? 0;
    return {
      startWeek,
      weeks,
      members: [],
      page: {
        number: filters.page,
        size: filters.pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / filters.pageSize)),
      },
      canManageAvailability: access.role !== "member",
    };
  }
  const [workspacePeriods, memberPeriods, allocations, actuals, estimates] =
    await Promise.all([
      getDb()
        .select()
        .from(workspaceDeliveryAvailabilityPeriods)
        .where(
          and(
            eq(workspaceDeliveryAvailabilityPeriods.workspaceId, workspaceId),
            lte(workspaceDeliveryAvailabilityPeriods.effectiveFrom, endWeek),
            or(
              isNull(workspaceDeliveryAvailabilityPeriods.effectiveTo),
              gte(workspaceDeliveryAvailabilityPeriods.effectiveTo, startWeek),
            ),
          ),
        ),
      getDb()
        .select()
        .from(memberDeliveryAvailabilityPeriods)
        .where(
          and(
            eq(memberDeliveryAvailabilityPeriods.workspaceId, workspaceId),
            inArray(memberDeliveryAvailabilityPeriods.userId, memberIds),
            lte(memberDeliveryAvailabilityPeriods.effectiveFrom, endWeek),
            or(
              isNull(memberDeliveryAvailabilityPeriods.effectiveTo),
              gte(memberDeliveryAvailabilityPeriods.effectiveTo, startWeek),
            ),
          ),
        ),
      getDb()
        .select({
          id: projectAllocations.id,
          memberUserId: projectAllocations.memberUserId,
          projectId: projectAllocations.projectId,
          projectKey: projects.key,
          projectName: projects.name,
          leadUserId: projects.leadUserId,
          startWeek: projectAllocations.startWeek,
          endWeek: projectAllocations.endWeek,
          plannedMinutesPerWeek: projectAllocations.plannedMinutesPerWeek,
          roleLabel: projectAllocations.roleLabel,
        })
        .from(projectAllocations)
        .innerJoin(projects, eq(projects.id, projectAllocations.projectId))
        .where(
          and(
            eq(projectAllocations.workspaceId, workspaceId),
            inArray(projectAllocations.memberUserId, memberIds),
            isNull(projectAllocations.deletedAt),
            lte(projectAllocations.startWeek, endWeek),
            gte(projectAllocations.endWeek, startWeek),
            ...(filters.projectId
              ? [eq(projectAllocations.projectId, filters.projectId)]
              : []),
          ),
        ),
      getDb().execute<{
        member_user_id: string;
        week: string;
        minutes: number;
      }>(sql`
        select member_user_id, date_trunc('week', work_date::timestamp)::date::text week,
          sum(duration_minutes)::int minutes
        from delivery_time_entries
        where workspace_id = ${workspaceId}
          and member_user_id in (${sql.join(
            memberIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          and deleted_at is null and work_date >= ${startWeek}::date
          and work_date < (${endWeek}::date + interval '7 days')
          ${filters.projectId ? sql`and project_id = ${filters.projectId}` : sql``}
        group by member_user_id, date_trunc('week', work_date::timestamp)
      `),
      getDb()
        .select({
          memberUserId: workItems.assigneeUserId,
          assignedWorkCount: count(),
          estimatePoints: sql<number>`coalesce(sum(${workItems.estimatePoints}), 0)::int`,
          unscheduledCount: sql<number>`count(*) filter (where ${workItems.targetDate} is null)::int`,
        })
        .from(workItems)
        .innerJoin(projects, eq(projects.id, workItems.projectId))
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            inArray(workItems.assigneeUserId, memberIds),
            isNull(workItems.archivedAt),
            sql`${workItems.status} not in ('done', 'canceled')`,
            ...(filters.projectId
              ? [eq(workItems.projectId, filters.projectId)]
              : []),
          ),
        )
        .groupBy(workItems.assigneeUserId),
    ]);
  const actualByMemberWeek = new Map(
    actuals.rows.map((row) => [
      `${row.member_user_id}:${row.week}`,
      Number(row.minutes),
    ]),
  );
  const estimatesByMember = new Map(
    estimates.map((row) => [row.memberUserId, row]),
  );
  return {
    startWeek,
    weeks,
    canManageAvailability: access.role !== "member",
    members: memberRows.map((member) => {
      const memberAllocations = allocations.filter(
        (allocation) => allocation.memberUserId === member.id,
      );
      return {
        ...member,
        estimateContext: estimatesByMember.get(member.id) ?? {
          assignedWorkCount: 0,
          estimatePoints: 0,
          unscheduledCount: 0,
        },
        weeks: weeks.map((week) => {
          const availableMinutes = availabilityForWeek(
            week,
            workspacePeriods,
            memberPeriods.filter((period) => period.userId === member.id),
          );
          const weekAllocations = memberAllocations.filter(
            (allocation) =>
              allocation.startWeek <= week && allocation.endWeek >= week,
          );
          const visibleAllocations = weekAllocations.map((allocation) => {
            const visible =
              access.role !== "member" ||
              member.id === actor.userId ||
              allocation.leadUserId === actor.userId;
            return visible
              ? allocation
              : {
                  ...allocation,
                  projectId: null,
                  projectKey: null,
                  projectName: "Other committed work",
                  roleLabel: null,
                };
          });
          const allocatedMinutes = weekAllocations.reduce(
            (total, allocation) => total + allocation.plannedMinutesPerWeek,
            0,
          );
          return {
            week,
            availableMinutes,
            allocatedMinutes,
            actualMinutes: actualByMemberWeek.get(`${member.id}:${week}`) ?? 0,
            overallocatedMinutes: Math.max(
              allocatedMinutes - availableMinutes,
              0,
            ),
            allocations: visibleAllocations,
          };
        }),
      };
    }),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totalRows[0]?.total ?? 0,
      pages: Math.max(
        1,
        Math.ceil((totalRows[0]?.total ?? 0) / filters.pageSize),
      ),
    },
  };
}

function conditionsPush<T>(conditions: T[], condition: T) {
  conditions.push(condition);
}

function availabilityForWeek(
  week: string,
  workspacePeriods: Array<{
    weeklyMinutes: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>,
  memberPeriods: Array<{
    weeklyMinutes: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>,
) {
  const active = (period: {
    weeklyMinutes: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }) =>
    period.effectiveFrom <= week &&
    (!period.effectiveTo || period.effectiveTo >= week);
  return (
    memberPeriods.find(active)?.weeklyMinutes ??
    workspacePeriods.find(active)?.weeklyMinutes ??
    DEFAULT_WEEKLY_DELIVERY_MINUTES
  );
}

export async function createTimeEntry(
  actor: UserActor,
  workspaceId: string,
  input: TimeEntryInput,
) {
  const workspace = await getWorkspaceOperationsAccess(actor, workspaceId);
  if (input.workDate > dateInTimeZone(new Date(), workspace.timezone)) {
    throw conflict(
      "future_time_entry",
      "Delivery actuals cannot be future-dated.",
    );
  }
  return getDb().transaction(async (transaction) => {
    await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      input.projectId,
    );
    if (input.workItemId) {
      const work = await transaction
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.id, input.workItemId),
            eq(workItems.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!work[0]) throw notFound();
    }
    const id = randomUUID();
    await transaction.insert(deliveryTimeEntries).values({
      id,
      workspaceId,
      ...input,
      memberUserId: actor.userId,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.time_entry.created.v1",
      targetType: "delivery_time_entry",
      targetId: id,
      metadata: {
        projectId: input.projectId,
        workDate: input.workDate,
        durationMinutes: String(input.durationMinutes),
        classification: input.classification,
      },
    });
    return { id, memberUserId: actor.userId, ...input };
  });
}

export async function updateTimeEntry(
  actor: UserActor,
  workspaceId: string,
  entryId: string,
  input: UpdateTimeEntryInput,
) {
  const workspace = await getWorkspaceOperationsAccess(actor, workspaceId);
  if (
    input.workDate &&
    input.workDate > dateInTimeZone(new Date(), workspace.timezone)
  ) {
    throw conflict(
      "future_time_entry",
      "Delivery actuals cannot be future-dated.",
    );
  }
  return getDb().transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(deliveryTimeEntries)
      .where(
        and(
          eq(deliveryTimeEntries.id, entryId),
          eq(deliveryTimeEntries.workspaceId, workspaceId),
          eq(deliveryTimeEntries.memberUserId, actor.userId),
          isNull(deliveryTimeEntries.deletedAt),
        ),
      )
      .limit(1);
    const current = rows[0];
    if (!current) throw notFound();
    await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      current.projectId,
    );
    if (input.workItemId) {
      const work = await transaction
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.id, input.workItemId),
            eq(workItems.projectId, current.projectId),
          ),
        )
        .limit(1);
      if (!work[0]) throw notFound();
    }
    await transaction
      .update(deliveryTimeEntries)
      .set({ ...input, updatedByUserId: actor.userId, updatedAt: new Date() })
      .where(eq(deliveryTimeEntries.id, entryId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.time_entry.updated.v1",
      targetType: "delivery_time_entry",
      targetId: entryId,
      metadata: { projectId: current.projectId },
    });
    return { ...current, ...input };
  });
}

export async function deleteTimeEntry(
  actor: UserActor,
  workspaceId: string,
  entryId: string,
) {
  return getDb().transaction(async (transaction) => {
    const rows = await transaction
      .select({ projectId: deliveryTimeEntries.projectId })
      .from(deliveryTimeEntries)
      .where(
        and(
          eq(deliveryTimeEntries.id, entryId),
          eq(deliveryTimeEntries.workspaceId, workspaceId),
          eq(deliveryTimeEntries.memberUserId, actor.userId),
          isNull(deliveryTimeEntries.deletedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) throw notFound();
    await assertWritableProject(
      transaction,
      actor,
      workspaceId,
      rows[0].projectId,
    );
    await transaction
      .update(deliveryTimeEntries)
      .set({
        deletedAt: new Date(),
        deletedByUserId: actor.userId,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(deliveryTimeEntries.id, entryId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "operations.time_entry.deleted.v1",
      targetType: "delivery_time_entry",
      targetId: entryId,
      metadata: { projectId: rows[0].projectId },
    });
    return { deleted: true };
  });
}

export async function listTimeEntries(
  actor: UserActor,
  workspaceId: string,
  filters: TimeEntryFilters,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  const conditions = [
    eq(deliveryTimeEntries.workspaceId, workspaceId),
    isNull(deliveryTimeEntries.deletedAt),
  ];
  if (access.role === "member") {
    conditions.push(
      or(
        eq(deliveryTimeEntries.memberUserId, actor.userId),
        eq(projects.leadUserId, actor.userId),
      )!,
    );
  }
  if (filters.projectId)
    conditions.push(eq(deliveryTimeEntries.projectId, filters.projectId));
  if (filters.memberId)
    conditions.push(eq(deliveryTimeEntries.memberUserId, filters.memberId));
  if (filters.workItemId)
    conditions.push(eq(deliveryTimeEntries.workItemId, filters.workItemId));
  if (filters.from)
    conditions.push(gte(deliveryTimeEntries.workDate, filters.from));
  if (filters.to)
    conditions.push(lte(deliveryTimeEntries.workDate, filters.to));
  if (filters.classification)
    conditions.push(
      eq(deliveryTimeEntries.classification, filters.classification),
    );
  const where = and(...conditions);
  const [rows, totals, aggregates] = await Promise.all([
    getDb()
      .select({
        id: deliveryTimeEntries.id,
        memberUserId: deliveryTimeEntries.memberUserId,
        memberName: users.name,
        projectId: projects.id,
        projectKey: projects.key,
        projectName: projects.name,
        leadUserId: projects.leadUserId,
        workItemId: workItems.id,
        workItemNumber: workItems.number,
        workItemTitle: workItems.title,
        workDate: deliveryTimeEntries.workDate,
        durationMinutes: deliveryTimeEntries.durationMinutes,
        classification: deliveryTimeEntries.classification,
        note: deliveryTimeEntries.note,
        createdAt: deliveryTimeEntries.createdAt,
        updatedAt: deliveryTimeEntries.updatedAt,
      })
      .from(deliveryTimeEntries)
      .innerJoin(users, eq(users.id, deliveryTimeEntries.memberUserId))
      .innerJoin(projects, eq(projects.id, deliveryTimeEntries.projectId))
      .leftJoin(workItems, eq(workItems.id, deliveryTimeEntries.workItemId))
      .where(where)
      .orderBy(
        desc(deliveryTimeEntries.workDate),
        desc(deliveryTimeEntries.createdAt),
        desc(deliveryTimeEntries.id),
      )
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(deliveryTimeEntries)
      .innerJoin(projects, eq(projects.id, deliveryTimeEntries.projectId))
      .where(where),
    getDb()
      .select({
        classification: deliveryTimeEntries.classification,
        minutes: sql<number>`coalesce(sum(${deliveryTimeEntries.durationMinutes}), 0)::int`,
      })
      .from(deliveryTimeEntries)
      .innerJoin(projects, eq(projects.id, deliveryTimeEntries.projectId))
      .where(where)
      .groupBy(deliveryTimeEntries.classification),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      canEdit: row.memberUserId === actor.userId,
    })),
    aggregate: {
      billableMinutes:
        aggregates.find((row) => row.classification === "billable")?.minutes ??
        0,
      nonBillableMinutes:
        aggregates.find((row) => row.classification === "non_billable")
          ?.minutes ?? 0,
    },
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

export async function listCommercialExposure(
  actor: UserActor,
  workspaceId: string,
  filters: PortfolioFilters,
) {
  const access = await getWorkspaceOperationsAccess(actor, workspaceId);
  const conditions = [eq(projects.workspaceId, workspaceId)];
  const manager = projectManagerCondition(actor, access);
  if (manager) conditions.push(manager);
  if (filters.lifecycle !== "all")
    conditions.push(eq(projects.lifecycle, filters.lifecycle));
  if (filters.clientId)
    conditions.push(eq(projects.clientId, filters.clientId));
  if (filters.query) {
    conditions.push(
      or(
        ilike(projects.key, `%${filters.query}%`),
        ilike(projects.name, `%${filters.query}%`),
        ilike(clients.name, `%${filters.query}%`),
      )!,
    );
  }
  const where = and(...conditions);
  const [projectRows, totals] = await Promise.all([
    getDb()
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        clientName: clients.name,
        lifecycle: projects.lifecycle,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(where)
      .orderBy(asc(projects.name), asc(projects.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(where),
  ]);
  const summaries = await commercialExposureForProjects(
    projectRows.map((project) => project.id),
  );
  return {
    items: projectRows.map((project) => ({
      ...project,
      summary: summaries.get(project.id) ?? emptyExposure(),
    })),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

export async function getProjectCommercialExposure(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  assertProjectManager(access, actor.userId);
  const summaries = await commercialExposureForProjects([projectId]);
  return summaries.get(projectId) ?? emptyExposure();
}

async function commercialExposureForProjects(projectIds: string[]) {
  const summaries = new Map<string, CommercialExposureSummary>();
  if (!projectIds.length) return summaries;
  const ids = sql.join(
    projectIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const currentImpacts = sql`
    select impact.*, request.state request_state, request.title request_title,
      decision.disposition, packet.requirement packet_requirement,
      action.action packet_action,
      case
        when impact.confidence = 'confirmed'
          and decision.id is not null
          and (
            decision.disposition in ('covered', 'absorbed')
            or (
              decision.disposition in ('swap', 'paid_change')
              and packet.requirement = 'approval'
              and action.action = 'approved'
            )
          )
        then 'confirmed'
        else 'pending'
      end bucket
    from commercial_impact_assessments impact
    inner join commercial_requests request on request.id = impact.request_id
    left join commercial_decisions decision
      on decision.id = impact.decision_id and decision.superseded_at is null
    left join client_commercial_packets packet
      on packet.request_id = request.id
      and packet.decision_id = decision.id
      and packet.superseded_at is null
      and (packet.impact_assessment_id is null
        or packet.impact_assessment_id = impact.id)
    left join lateral (
      select packet_action.action
      from client_commercial_packet_actions packet_action
      where packet_action.packet_id = packet.id
      order by packet_action.acted_at desc, packet_action.id desc
      limit 1
    ) action on true
    where impact.project_id in (${ids})
      and not exists (
        select 1 from commercial_impact_assessments successor
        where successor.supersedes_impact_assessment_id = impact.id
      )
  `;
  const [
    baselineRows,
    impactRows,
    actualRows,
    pendingRequestRows,
    scheduleRows,
  ] = await Promise.all([
    getDb().execute<{
      project_id: string;
      id: string;
      label: string;
      version_number: number | null;
      effective_at: Date | string | null;
    }>(sql`
      select project_id, id, label, version_number, effective_at
      from commercial_baseline_versions
      where project_id in (${ids}) and state = 'effective'
    `),
    getDb().execute<{
      project_id: string;
      bucket: "confirmed" | "pending";
      currency_code: string | null;
      monetary_amount: string | null;
      effort_minutes: number;
      schedule_impact_count: number;
      request_count: number;
    }>(sql`
      with current_impacts as (${currentImpacts})
      select project_id, bucket, currency_code,
        sum(monetary_amount)::text monetary_amount,
        coalesce(sum(effort_minutes), 0)::int effort_minutes,
        count(*) filter (where schedule_delta_days is not null or target_date is not null)::int schedule_impact_count,
        count(distinct request_id) filter (
          where bucket = 'pending' and request_state in ('open', 'needs_clarification')
        )::int request_count
      from current_impacts
      where bucket = 'confirmed'
        or request_state in ('open', 'needs_clarification')
        or packet_requirement = 'approval'
        or disposition in ('swap', 'paid_change')
      group by project_id, bucket, currency_code
    `),
    getDb()
      .select({
        projectId: deliveryTimeEntries.projectId,
        classification: deliveryTimeEntries.classification,
        minutes: sql<number>`coalesce(sum(${deliveryTimeEntries.durationMinutes}), 0)::int`,
      })
      .from(deliveryTimeEntries)
      .where(
        and(
          inArray(deliveryTimeEntries.projectId, projectIds),
          isNull(deliveryTimeEntries.deletedAt),
        ),
      )
      .groupBy(
        deliveryTimeEntries.projectId,
        deliveryTimeEntries.classification,
      ),
    getDb().execute<{ project_id: string; request_count: number }>(sql`
      select project_id, count(*)::int request_count
      from commercial_requests
      where project_id in (${ids}) and state in ('open', 'needs_clarification')
      group by project_id
    `),
    getDb().execute<{
      project_id: string;
      bucket: "confirmed" | "pending";
      id: string;
      request_id: string;
      request_title: string;
      schedule_delta_days: number | null;
      target_date: string | null;
    }>(sql`
      with current_impacts as (${currentImpacts}), ranked as (
        select current_impacts.*,
          row_number() over (
            partition by project_id, bucket
            order by created_at desc, id desc
          ) position
        from current_impacts
        where schedule_delta_days is not null or target_date is not null
      )
      select project_id, bucket, id, request_id, request_title,
        schedule_delta_days, target_date
      from ranked where position <= 20
      order by project_id, bucket, position
    `),
  ]);
  for (const projectId of projectIds) summaries.set(projectId, emptyExposure());
  for (const baseline of baselineRows.rows) {
    const summary = summaries.get(baseline.project_id)!;
    summary.baseline = {
      versionId: baseline.id,
      label: baseline.label,
      versionNumber: baseline.version_number,
      effectiveAt: baseline.effective_at
        ? new Date(baseline.effective_at).toISOString()
        : null,
    };
  }
  for (const impact of impactRows.rows) {
    const summary = summaries.get(impact.project_id)!;
    const bucket = summary[impact.bucket];
    bucket.effortMinutes += Number(impact.effort_minutes);
    bucket.scheduleImpactCount += Number(impact.schedule_impact_count);
    if (impact.bucket === "pending")
      summary.pending.requestCount = Math.max(
        summary.pending.requestCount,
        Number(impact.request_count),
      );
    if (impact.currency_code && impact.monetary_amount) {
      bucket.money.push({
        currencyCode: impact.currency_code,
        amount: impact.monetary_amount,
      });
    }
  }
  for (const actual of actualRows) {
    const summary = summaries.get(actual.projectId)!;
    if (actual.classification === "billable")
      summary.actual.billableMinutes = actual.minutes;
    else summary.actual.nonBillableMinutes = actual.minutes;
  }
  for (const request of pendingRequestRows.rows) {
    summaries.get(request.project_id)!.pending.requestCount = Number(
      request.request_count,
    );
  }
  for (const impact of scheduleRows.rows) {
    summaries.get(impact.project_id)![impact.bucket].scheduleImpacts.push({
      impactId: impact.id,
      requestId: impact.request_id,
      requestTitle: impact.request_title,
      scheduleDeltaDays: impact.schedule_delta_days,
      targetDate: impact.target_date,
    });
  }
  return summaries;
}

function emptyExposure(): CommercialExposureSummary {
  return {
    baseline: null,
    confirmed: {
      money: [],
      effortMinutes: 0,
      scheduleImpactCount: 0,
      scheduleImpacts: [],
    },
    pending: {
      money: [],
      effortMinutes: 0,
      scheduleImpactCount: 0,
      scheduleImpacts: [],
      requestCount: 0,
    },
    actual: { billableMinutes: 0, nonBillableMinutes: 0 },
  };
}

function conflict(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
) {
  return new PlatformError(code, 409, message, fieldErrors);
}
