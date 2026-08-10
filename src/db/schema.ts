import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.from(value as Uint8Array);
  },
});

const timestampColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestampColumns,
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestampColumns,
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_uidx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestampColumns,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").default(0).notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("auth_rate_limits_key_uidx").on(table.key)],
);

export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
]);
export const invitationState = pgEnum("invitation_state", [
  "pending",
  "accepted",
  "revoked",
]);
export const auditActorType = pgEnum("audit_actor_type", [
  "human",
  "system",
  "integration",
  "ai_agent",
]);
export const clientLifecycle = pgEnum("client_lifecycle", [
  "active",
  "archived",
]);
export const projectLifecycle = pgEnum("project_lifecycle", [
  "active",
  "completed",
  "archived",
]);
export const milestoneStatus = pgEnum("milestone_status", [
  "planned",
  "in_progress",
  "completed",
  "archived",
]);
export const cycleLifecycle = pgEnum("cycle_lifecycle", [
  "planned",
  "active",
  "completed",
  "archived",
]);
export const workItemStatus = pgEnum("work_item_status", [
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);
export const workItemPriority = pgEnum("work_item_priority", [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const workPurpose = pgEnum("work_purpose", [
  "unclassified",
  "client_delivery",
  "delivery_support",
  "internal",
]);

export const commercialSourceKind = pgEnum("commercial_source_kind", [
  "pasted_text",
  "pdf",
  "docx",
]);

export const commercialParseState = pgEnum("commercial_parse_state", [
  "ready",
  "needs_ocr",
  "failed",
]);

export const commercialScopeKind = pgEnum("commercial_scope_kind", [
  "deliverable",
  "requirement",
  "exclusion",
  "constraint",
]);

export const commercialBaselineVersionState = pgEnum(
  "commercial_baseline_version_state",
  ["draft", "effective", "superseded"],
);

export const commercialScopeLineageKind = pgEnum(
  "commercial_scope_lineage_kind",
  ["carried_forward", "revised", "added", "retired"],
);

export const commercialRequestState = pgEnum("commercial_request_state", [
  "open",
  "needs_clarification",
  "resolved",
  "withdrawn",
]);

export const commercialDecisionDisposition = pgEnum(
  "commercial_decision_disposition",
  ["covered", "absorbed", "swap", "paid_change", "deferred", "rejected"],
);

export const commercialCoverageBasis = pgEnum("commercial_coverage_basis", [
  "baseline",
  "defect_or_warranty",
  "revision_allowance",
  "other_existing_obligation",
]);

export const commercialDecisionScopeRole = pgEnum(
  "commercial_decision_scope_role",
  ["affected", "swap_offset"],
);

export const commercialImpactConfidence = pgEnum(
  "commercial_impact_confidence",
  ["estimate", "confirmed"],
);

export const commercialBasisType = pgEnum("commercial_basis_type", [
  "baseline_scope_item",
  "commercial_decision",
]);

export const workItemSubscriptionState = pgEnum(
  "work_item_subscription_state",
  ["watching", "muted"],
);

export const workItemSubscriptionSource = pgEnum(
  "work_item_subscription_source",
  ["automatic", "explicit"],
);

export const notificationKind = pgEnum("notification_kind", [
  "mention",
  "work_item_assigned",
  "comment_added",
  "comment_reply",
]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestampColumns,
});

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  timezone: text("timezone").default("UTC").notNull(),
  ...timestampColumns,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("memberships_workspace_user_uidx").on(
      table.workspaceId,
      table.userId,
    ),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull(),
    state: invitationState("state").default("pending").notNull(),
    tokenHash: text("token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("workspace_invitations_workspace_email_uidx").on(
      table.workspaceId,
      table.email,
    ),
    uniqueIndex("workspace_invitations_token_hash_uidx").on(table.tokenHash),
  ],
);

export const actionRateLimits = pgTable(
  "action_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("action_rate_limits_expires_at_idx").on(table.expiresAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    actorType: auditActorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    eventType: text("event_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | string[]>>()
      .notNull(),
  },
  (table) => [
    index("audit_events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("audit_events_target_idx").on(table.targetType, table.targetId),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    internalReference: text("internal_reference"),
    summary: text("summary"),
    lifecycle: clientLifecycle("lifecycle").default("active").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("clients_id_workspace_unique").on(table.id, table.workspaceId),
    index("clients_workspace_lifecycle_name_idx").on(
      table.workspaceId,
      table.lifecycle,
      table.name,
    ),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    leadUserId: uuid("lead_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lifecycle: projectLifecycle("lifecycle").default("active").notNull(),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    nextWorkItemNumber: integer("next_work_item_number").default(1).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.workspaceId],
      foreignColumns: [clients.id, clients.workspaceId],
      name: "projects_client_workspace_fk",
    }).onDelete("restrict"),
    uniqueIndex("projects_workspace_key_uidx").on(table.workspaceId, table.key),
    unique("projects_id_workspace_unique").on(table.id, table.workspaceId),
    index("projects_workspace_lifecycle_name_idx").on(
      table.workspaceId,
      table.lifecycle,
      table.name,
    ),
    check(
      "projects_next_work_item_positive",
      sql`${table.nextWorkItemNumber} > 0`,
    ),
  ],
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "project_memberships_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "project_memberships_workspace_member_fk",
    }).onDelete("cascade"),
    index("project_memberships_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: date("target_date"),
    status: milestoneStatus("status").default("planned").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("milestones_id_project_unique").on(table.id, table.projectId),
    index("milestones_project_status_order_idx").on(
      table.projectId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const cycles = pgTable(
  "cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    lifecycle: cycleLifecycle("lifecycle").default("planned").notNull(),
    goal: text("goal"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("cycles_id_project_unique").on(table.id, table.projectId),
    uniqueIndex("cycles_project_sequence_uidx").on(
      table.projectId,
      table.sequence,
    ),
    index("cycles_project_lifecycle_dates_idx").on(
      table.projectId,
      table.lifecycle,
      table.startDate,
      table.sequence,
    ),
    check("cycles_sequence_positive", sql`${table.sequence} > 0`),
    check("cycles_date_order", sql`${table.startDate} <= ${table.endDate}`),
  ],
);

export const projectLabels = pgTable(
  "project_labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("slate").notNull(),
    ...timestampColumns,
  },
  (table) => [
    unique("project_labels_id_project_unique").on(table.id, table.projectId),
    uniqueIndex("project_labels_project_name_uidx").on(
      table.projectId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    parentId: uuid("parent_id"),
    title: text("title").notNull(),
    description: text("description"),
    acceptanceCriteria: text("acceptance_criteria"),
    status: workItemStatus("status").default("backlog").notNull(),
    priority: workItemPriority("priority").default("none").notNull(),
    purpose: workPurpose("purpose").default("unclassified").notNull(),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    estimatePoints: integer("estimate_points"),
    targetDate: date("target_date"),
    milestoneId: uuid("milestone_id"),
    cycleId: uuid("cycle_id"),
    sortOrder: integer("sort_order").default(0).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("work_items_project_number_uidx").on(
      table.projectId,
      table.number,
    ),
    unique("work_items_id_project_unique").on(table.id, table.projectId),
    foreignKey({
      columns: [table.parentId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "work_items_parent_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.milestoneId, table.projectId],
      foreignColumns: [milestones.id, milestones.projectId],
      name: "work_items_milestone_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.cycleId, table.projectId],
      foreignColumns: [cycles.id, cycles.projectId],
      name: "work_items_cycle_project_fk",
    }).onDelete("restrict"),
    index("work_items_project_status_order_idx").on(
      table.projectId,
      table.status,
      table.sortOrder,
      table.id,
    ),
    index("work_items_project_assignee_idx").on(
      table.projectId,
      table.assigneeUserId,
    ),
    index("work_items_assignee_status_target_idx").on(
      table.assigneeUserId,
      table.status,
      table.targetDate,
      table.id,
    ),
    index("work_items_project_milestone_idx").on(
      table.projectId,
      table.milestoneId,
    ),
    index("work_items_project_cycle_idx").on(table.projectId, table.cycleId),
    check("work_items_number_positive", sql`${table.number} > 0`),
    check(
      "work_items_estimate_range",
      sql`${table.estimatePoints} is null or ${table.estimatePoints} between 1 and 100`,
    ),
  ],
);

export const commercialEvidenceSources = pgTable(
  "commercial_evidence_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    kind: commercialSourceKind("kind").notNull(),
    name: text("name").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    contentSha256: text("content_sha256").notNull(),
    originalContent: bytea("original_content").notNull(),
    extractedText: text("extracted_text"),
    parseState: commercialParseState("parse_state").notNull(),
    parseErrorCode: text("parse_error_code"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    unique("commercial_sources_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("commercial_sources_project_idempotency_uidx").on(
      table.projectId,
      table.idempotencyKey,
    ),
    index("commercial_sources_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    check(
      "commercial_sources_name_length",
      sql`char_length(btrim(${table.name})) between 1 and 160`,
    ),
    check(
      "commercial_sources_byte_size",
      sql`${table.byteSize} between 1 and 5242880`,
    ),
    check(
      "commercial_sources_hash_format",
      sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "commercial_sources_parse_state",
      sql`(${table.parseState} = 'ready' and ${table.extractedText} is not null and char_length(${table.extractedText}) between 1 and 500000 and ${table.parseErrorCode} is null) or (${table.parseState} <> 'ready' and ${table.extractedText} is null and ${table.parseErrorCode} is not null)`,
    ),
  ],
);

export const commercialBaselines = pgTable(
  "commercial_baselines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_baselines_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("commercial_baselines_project_uidx").on(table.projectId),
  ],
);

export const commercialBaselineVersions = pgTable(
  "commercial_baseline_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    baselineId: uuid("baseline_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    previousVersionId: uuid("previous_version_id"),
    versionNumber: integer("version_number"),
    label: text("label").notNull(),
    state: commercialBaselineVersionState("state").default("draft").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    effectiveByUserId: uuid("effective_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_baseline_versions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.baselineId, table.projectId],
      foreignColumns: [commercialBaselines.id, commercialBaselines.projectId],
      name: "commercial_baseline_versions_baseline_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceId, table.projectId],
      foreignColumns: [
        commercialEvidenceSources.id,
        commercialEvidenceSources.projectId,
      ],
      name: "commercial_baseline_versions_source_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.previousVersionId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "commercial_baseline_versions_previous_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("commercial_baseline_versions_number_uidx").on(
      table.baselineId,
      table.versionNumber,
    ),
    uniqueIndex("commercial_baseline_versions_effective_uidx")
      .on(table.baselineId)
      .where(sql`${table.state} = 'effective'`),
    uniqueIndex("commercial_baseline_versions_draft_uidx")
      .on(table.baselineId)
      .where(sql`${table.state} = 'draft'`),
    index("commercial_baseline_versions_project_state_idx").on(
      table.projectId,
      table.state,
      table.createdAt,
      table.id,
    ),
    check(
      "commercial_baseline_versions_number_positive",
      sql`${table.versionNumber} is null or ${table.versionNumber} > 0`,
    ),
    check(
      "commercial_baseline_versions_label_length",
      sql`char_length(btrim(${table.label})) between 1 and 160`,
    ),
    check(
      "commercial_baseline_versions_lifecycle",
      sql`(${table.state} = 'draft' and ${table.versionNumber} is null and ${table.effectiveAt} is null and ${table.effectiveByUserId} is null and ${table.supersededAt} is null) or (${table.state} = 'effective' and ${table.versionNumber} is not null and ${table.effectiveAt} is not null and ${table.effectiveByUserId} is not null and ${table.supersededAt} is null) or (${table.state} = 'superseded' and ${table.versionNumber} is not null and ${table.effectiveAt} is not null and ${table.effectiveByUserId} is not null and ${table.supersededAt} is not null and ${table.supersededAt} >= ${table.effectiveAt})`,
    ),
  ],
);

export const commercialBaselineVersionSources = pgTable(
  "commercial_baseline_version_sources",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    baselineVersionId: uuid("baseline_version_id").notNull(),
    sourceId: uuid("source_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.baselineVersionId, table.sourceId] }),
    foreignKey({
      columns: [table.baselineVersionId, table.projectId],
      foreignColumns: [
        commercialBaselineVersions.id,
        commercialBaselineVersions.projectId,
      ],
      name: "commercial_baseline_version_sources_version_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceId, table.projectId],
      foreignColumns: [
        commercialEvidenceSources.id,
        commercialEvidenceSources.projectId,
      ],
      name: "commercial_baseline_version_sources_source_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialScopeItems = pgTable(
  "commercial_scope_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    baselineVersionId: uuid("baseline_version_id").notNull(),
    materialBasisScopeItemId: uuid("material_basis_scope_item_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("commercial_scope_items_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    unique("commercial_scope_items_id_version_project_unique").on(
      table.id,
      table.baselineVersionId,
      table.projectId,
    ),
    foreignKey({
      columns: [table.baselineVersionId, table.projectId],
      foreignColumns: [
        commercialBaselineVersions.id,
        commercialBaselineVersions.projectId,
      ],
      name: "commercial_scope_items_version_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.materialBasisScopeItemId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "commercial_scope_items_material_basis_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("commercial_scope_items_project_idempotency_uidx").on(
      table.projectId,
      table.idempotencyKey,
    ),
    index("commercial_scope_items_version_archived_idx").on(
      table.baselineVersionId,
      table.archivedAt,
      table.id,
    ),
  ],
);

export const commercialScopeItemRevisions = pgTable(
  "commercial_scope_item_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scopeItemId: uuid("scope_item_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    kind: commercialScopeKind("kind").notNull(),
    title: text("title").notNull(),
    details: text("details"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_scope_revisions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.scopeItemId, table.projectId],
      foreignColumns: [commercialScopeItems.id, commercialScopeItems.projectId],
      name: "commercial_scope_revisions_item_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("commercial_scope_revisions_number_uidx").on(
      table.scopeItemId,
      table.revisionNumber,
    ),
    uniqueIndex("commercial_scope_revisions_idempotency_uidx").on(
      table.scopeItemId,
      table.idempotencyKey,
    ),
    check(
      "commercial_scope_revisions_number_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "commercial_scope_revisions_title_length",
      sql`char_length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      "commercial_scope_revisions_details_length",
      sql`${table.details} is null or char_length(${table.details}) <= 10000`,
    ),
  ],
);

export const commercialScopeItemLineages = pgTable(
  "commercial_scope_item_lineages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    baselineVersionId: uuid("baseline_version_id").notNull(),
    previousScopeItemId: uuid("previous_scope_item_id"),
    currentScopeItemId: uuid("current_scope_item_id").notNull(),
    kind: commercialScopeLineageKind("kind").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_scope_lineages_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.baselineVersionId, table.projectId],
      foreignColumns: [
        commercialBaselineVersions.id,
        commercialBaselineVersions.projectId,
      ],
      name: "commercial_scope_lineages_version_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.previousScopeItemId, table.projectId],
      foreignColumns: [commercialScopeItems.id, commercialScopeItems.projectId],
      name: "commercial_scope_lineages_previous_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.currentScopeItemId,
        table.baselineVersionId,
        table.projectId,
      ],
      foreignColumns: [
        commercialScopeItems.id,
        commercialScopeItems.baselineVersionId,
        commercialScopeItems.projectId,
      ],
      name: "commercial_scope_lineages_current_version_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("commercial_scope_lineages_version_previous_uidx").on(
      table.baselineVersionId,
      table.previousScopeItemId,
    ),
    uniqueIndex("commercial_scope_lineages_version_current_uidx").on(
      table.baselineVersionId,
      table.currentScopeItemId,
    ),
    index("commercial_scope_lineages_project_kind_idx").on(
      table.projectId,
      table.kind,
      table.baselineVersionId,
    ),
    check(
      "commercial_scope_lineages_shape",
      sql`(${table.kind} = 'added' and ${table.previousScopeItemId} is null) or (${table.kind} <> 'added' and ${table.previousScopeItemId} is not null)`,
    ),
  ],
);

export const commercialEvidenceAnchors = pgTable(
  "commercial_evidence_anchors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    label: text("label"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_evidence_anchors_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.sourceId, table.projectId],
      foreignColumns: [
        commercialEvidenceSources.id,
        commercialEvidenceSources.projectId,
      ],
      name: "commercial_evidence_anchors_source_project_fk",
    }).onDelete("restrict"),
    index("commercial_evidence_anchors_source_offset_idx").on(
      table.sourceId,
      table.startOffset,
      table.id,
    ),
    check(
      "commercial_evidence_anchors_offsets",
      sql`${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset} and ${table.endOffset} <= 500000`,
    ),
    check(
      "commercial_evidence_anchors_label_length",
      sql`${table.label} is null or char_length(${table.label}) <= 120`,
    ),
  ],
);

export const commercialScopeRevisionAnchors = pgTable(
  "commercial_scope_revision_anchors",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scopeItemRevisionId: uuid("scope_item_revision_id").notNull(),
    evidenceAnchorId: uuid("evidence_anchor_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scopeItemRevisionId, table.evidenceAnchorId],
    }),
    foreignKey({
      columns: [table.scopeItemRevisionId, table.projectId],
      foreignColumns: [
        commercialScopeItemRevisions.id,
        commercialScopeItemRevisions.projectId,
      ],
      name: "commercial_scope_revision_anchors_revision_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.evidenceAnchorId, table.projectId],
      foreignColumns: [
        commercialEvidenceAnchors.id,
        commercialEvidenceAnchors.projectId,
      ],
      name: "commercial_scope_revision_anchors_anchor_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialRequests = pgTable(
  "commercial_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    state: commercialRequestState("state").default("open").notNull(),
    title: text("title").notNull(),
    requestText: text("request_text").notNull(),
    externalRequester: text("external_requester"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    unique("commercial_requests_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("commercial_requests_project_idempotency_uidx").on(
      table.projectId,
      table.idempotencyKey,
    ),
    index("commercial_requests_project_state_received_idx").on(
      table.projectId,
      table.state,
      table.receivedAt,
      table.id,
    ),
    check(
      "commercial_requests_title_length",
      sql`char_length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      "commercial_requests_text_length",
      sql`char_length(btrim(${table.requestText})) between 1 and 10000`,
    ),
    check(
      "commercial_requests_external_requester_length",
      sql`${table.externalRequester} is null or char_length(btrim(${table.externalRequester})) between 1 and 160`,
    ),
  ],
);

export const commercialRequestAnchors = pgTable(
  "commercial_request_anchors",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    evidenceAnchorId: uuid("evidence_anchor_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.evidenceAnchorId] }),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "commercial_request_anchors_request_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.evidenceAnchorId, table.projectId],
      foreignColumns: [
        commercialEvidenceAnchors.id,
        commercialEvidenceAnchors.projectId,
      ],
      name: "commercial_request_anchors_anchor_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialRequestScopeItems = pgTable(
  "commercial_request_scope_items",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    scopeItemId: uuid("scope_item_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.scopeItemId] }),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "commercial_request_scope_items_request_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.scopeItemId, table.projectId],
      foreignColumns: [commercialScopeItems.id, commercialScopeItems.projectId],
      name: "commercial_request_scope_items_scope_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialDecisions = pgTable(
  "commercial_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    disposition: commercialDecisionDisposition("disposition").notNull(),
    coverageBasis: commercialCoverageBasis("coverage_basis"),
    rationale: text("rationale"),
    supersedesDecisionId: uuid("supersedes_decision_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_decisions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.supersedesDecisionId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "commercial_decisions_supersedes_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "commercial_decisions_request_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("commercial_decisions_request_idempotency_uidx").on(
      table.requestId,
      table.idempotencyKey,
    ),
    uniqueIndex("commercial_decisions_supersedes_uidx").on(
      table.supersedesDecisionId,
    ),
    uniqueIndex("commercial_decisions_current_request_uidx")
      .on(table.requestId)
      .where(sql`${table.supersededAt} is null`),
    index("commercial_decisions_project_confirmed_idx").on(
      table.projectId,
      table.confirmedAt,
      table.id,
    ),
    check(
      "commercial_decisions_coverage_basis",
      sql`${table.disposition} = 'covered' or ${table.coverageBasis} is null`,
    ),
    check(
      "commercial_decisions_rationale_length",
      sql`${table.rationale} is null or char_length(${table.rationale}) <= 10000`,
    ),
    check(
      "commercial_decisions_superseded_time",
      sql`${table.supersededAt} is null or ${table.supersededAt} >= ${table.confirmedAt}`,
    ),
  ],
);

export const commercialDecisionAnchors = pgTable(
  "commercial_decision_anchors",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    decisionId: uuid("decision_id").notNull(),
    evidenceAnchorId: uuid("evidence_anchor_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.decisionId, table.evidenceAnchorId] }),
    foreignKey({
      columns: [table.decisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "commercial_decision_anchors_decision_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.evidenceAnchorId, table.projectId],
      foreignColumns: [
        commercialEvidenceAnchors.id,
        commercialEvidenceAnchors.projectId,
      ],
      name: "commercial_decision_anchors_anchor_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialDecisionScopeItems = pgTable(
  "commercial_decision_scope_items",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    decisionId: uuid("decision_id").notNull(),
    scopeItemId: uuid("scope_item_id").notNull(),
    role: commercialDecisionScopeRole("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.decisionId, table.scopeItemId, table.role] }),
    foreignKey({
      columns: [table.decisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "commercial_decision_scope_items_decision_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.scopeItemId, table.projectId],
      foreignColumns: [commercialScopeItems.id, commercialScopeItems.projectId],
      name: "commercial_decision_scope_items_scope_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialBaselineVersionDecisions = pgTable(
  "commercial_baseline_version_decisions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    baselineVersionId: uuid("baseline_version_id").notNull(),
    decisionId: uuid("decision_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.baselineVersionId, table.decisionId] }),
    foreignKey({
      columns: [table.baselineVersionId, table.projectId],
      foreignColumns: [
        commercialBaselineVersions.id,
        commercialBaselineVersions.projectId,
      ],
      name: "commercial_baseline_version_decisions_version_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.decisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "commercial_baseline_version_decisions_decision_project_fk",
    }).onDelete("restrict"),
    index("commercial_baseline_version_decisions_project_decision_idx").on(
      table.projectId,
      table.decisionId,
    ),
  ],
);

export const commercialImpactAssessments = pgTable(
  "commercial_impact_assessments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    decisionId: uuid("decision_id"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    confidence: commercialImpactConfidence("confidence").notNull(),
    effortMinutes: integer("effort_minutes"),
    scheduleDeltaDays: integer("schedule_delta_days"),
    targetDate: date("target_date"),
    monetaryAmount: numeric("monetary_amount", {
      precision: 18,
      scale: 2,
    }),
    currencyCode: text("currency_code"),
    notes: text("notes"),
    supersedesImpactAssessmentId: uuid("supersedes_impact_assessment_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_impacts_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.supersedesImpactAssessmentId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "commercial_impacts_supersedes_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "commercial_impacts_request_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.decisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "commercial_impacts_decision_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("commercial_impacts_request_idempotency_uidx").on(
      table.requestId,
      table.idempotencyKey,
    ),
    uniqueIndex("commercial_impacts_supersedes_uidx").on(
      table.supersedesImpactAssessmentId,
    ),
    index("commercial_impacts_request_created_idx").on(
      table.requestId,
      table.createdAt,
      table.id,
    ),
    check(
      "commercial_impacts_has_value",
      sql`${table.effortMinutes} is not null or ${table.scheduleDeltaDays} is not null or ${table.targetDate} is not null or ${table.monetaryAmount} is not null`,
    ),
    check(
      "commercial_impacts_effort_range",
      sql`${table.effortMinutes} is null or ${table.effortMinutes} between 0 and 100000000`,
    ),
    check(
      "commercial_impacts_schedule_range",
      sql`${table.scheduleDeltaDays} is null or ${table.scheduleDeltaDays} between -3650 and 3650`,
    ),
    check(
      "commercial_impacts_money_pair",
      sql`(${table.monetaryAmount} is null and ${table.currencyCode} is null) or (${table.monetaryAmount} is not null and ${table.currencyCode} ~ '^[A-Z]{3}$')`,
    ),
    check(
      "commercial_impacts_notes_length",
      sql`${table.notes} is null or char_length(${table.notes}) <= 5000`,
    ),
  ],
);

export const commercialImpactAssessmentAnchors = pgTable(
  "commercial_impact_assessment_anchors",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    impactAssessmentId: uuid("impact_assessment_id").notNull(),
    evidenceAnchorId: uuid("evidence_anchor_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.impactAssessmentId, table.evidenceAnchorId],
    }),
    foreignKey({
      columns: [table.impactAssessmentId, table.projectId],
      foreignColumns: [
        commercialImpactAssessments.id,
        commercialImpactAssessments.projectId,
      ],
      name: "commercial_impact_anchors_impact_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.evidenceAnchorId, table.projectId],
      foreignColumns: [
        commercialEvidenceAnchors.id,
        commercialEvidenceAnchors.projectId,
      ],
      name: "commercial_impact_anchors_anchor_project_fk",
    }).onDelete("restrict"),
  ],
);

export const commercialBasisLinks = pgTable(
  "commercial_basis_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").notNull(),
    basisType: commercialBasisType("basis_type").notNull(),
    scopeItemRevisionId: uuid("scope_item_revision_id"),
    decisionId: uuid("decision_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "commercial_basis_links_work_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.scopeItemRevisionId, table.projectId],
      foreignColumns: [
        commercialScopeItemRevisions.id,
        commercialScopeItemRevisions.projectId,
      ],
      name: "commercial_basis_links_scope_revision_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.decisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "commercial_basis_links_decision_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("commercial_basis_links_work_scope_uidx").on(
      table.workItemId,
      table.scopeItemRevisionId,
    ),
    uniqueIndex("commercial_basis_links_work_decision_uidx").on(
      table.workItemId,
      table.decisionId,
    ),
    index("commercial_basis_links_project_work_idx").on(
      table.projectId,
      table.workItemId,
    ),
    check(
      "commercial_basis_links_target",
      sql`(${table.basisType} = 'baseline_scope_item' and ${table.scopeItemRevisionId} is not null and ${table.decisionId} is null) or (${table.basisType} = 'commercial_decision' and ${table.scopeItemRevisionId} is null and ${table.decisionId} is not null)`,
    ),
  ],
);

export const workItemLabels = pgTable(
  "work_item_labels",
  {
    workItemId: uuid("work_item_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workItemId, table.labelId] }),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_labels_item_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.labelId, table.projectId],
      foreignColumns: [projectLabels.id, projectLabels.projectId],
      name: "work_item_labels_label_project_fk",
    }).onDelete("cascade"),
    index("work_item_labels_project_label_idx").on(
      table.projectId,
      table.labelId,
    ),
  ],
);

export const workItemDependencies = pgTable(
  "work_item_dependencies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    blockerWorkItemId: uuid("blocker_work_item_id").notNull(),
    blockedWorkItemId: uuid("blocked_work_item_id").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.blockerWorkItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_dependencies_blocker_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.blockedWorkItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_dependencies_blocked_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("work_item_dependencies_edge_uidx").on(
      table.projectId,
      table.blockerWorkItemId,
      table.blockedWorkItemId,
    ),
    index("work_item_dependencies_blocked_idx").on(
      table.projectId,
      table.blockedWorkItemId,
    ),
    check(
      "work_item_dependencies_not_self",
      sql`${table.blockerWorkItemId} <> ${table.blockedWorkItemId}`,
    ),
  ],
);

export const workItemComments = pgTable(
  "work_item_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").notNull(),
    parentCommentId: uuid("parent_comment_id"),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    body: text("body"),
    version: integer("version").default(1).notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_comments_item_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parentCommentId, table.workItemId, table.projectId],
      foreignColumns: [table.id, table.workItemId, table.projectId],
      name: "work_item_comments_parent_item_project_fk",
    }).onDelete("restrict"),
    unique("work_item_comments_id_item_project_unique").on(
      table.id,
      table.workItemId,
      table.projectId,
    ),
    uniqueIndex("work_item_comments_item_request_uidx").on(
      table.workItemId,
      table.requestId,
    ),
    index("work_item_comments_item_created_idx").on(
      table.workItemId,
      table.createdAt,
      table.id,
    ),
    index("work_item_comments_author_idx").on(
      table.authorUserId,
      table.createdAt,
    ),
    check("work_item_comments_version_positive", sql`${table.version} > 0`),
    check(
      "work_item_comments_body_state",
      sql`(${table.deletedAt} is null and ${table.body} is not null and char_length(btrim(${table.body})) between 1 and 10000) or (${table.deletedAt} is not null and ${table.body} is null)`,
    ),
  ],
);

export const workItemCommentRevisions = pgTable(
  "work_item_comment_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => workItemComments.id, { onDelete: "cascade" }),
    editorUserId: uuid("editor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("work_item_comment_revisions_version_uidx").on(
      table.commentId,
      table.version,
    ),
    index("work_item_comment_revisions_comment_created_idx").on(
      table.commentId,
      table.createdAt,
    ),
    check(
      "work_item_comment_revisions_version_positive",
      sql`${table.version} > 0`,
    ),
  ],
);

export const workItemCommentMentions = pgTable(
  "work_item_comment_mentions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => workItemComments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index("work_item_comment_mentions_user_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const projectNotes = pgTable(
  "project_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("project_notes_project_request_uidx").on(
      table.projectId,
      table.requestId,
    ),
    index("project_notes_project_archived_updated_idx").on(
      table.projectId,
      table.archivedAt,
      table.updatedAt,
      table.id,
    ),
    check(
      "project_notes_title_length",
      sql`char_length(btrim(${table.title})) between 1 and 120`,
    ),
    check(
      "project_notes_body_length",
      sql`char_length(btrim(${table.body})) between 1 and 20000`,
    ),
  ],
);

export const projectNoteMentions = pgTable(
  "project_note_mentions",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => projectNotes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.userId] }),
    index("project_note_mentions_user_idx").on(table.userId, table.createdAt),
  ],
);

export const workItemSubscriptions = pgTable(
  "work_item_subscriptions",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: workItemSubscriptionState("state").default("watching").notNull(),
    source: workItemSubscriptionSource("source").default("automatic").notNull(),
    ...timestampColumns,
  },
  (table) => [
    primaryKey({ columns: [table.workItemId, table.userId] }),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_subscriptions_item_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "work_item_subscriptions_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "work_item_subscriptions_workspace_member_fk",
    }).onDelete("cascade"),
    index("work_item_subscriptions_project_state_idx").on(
      table.projectId,
      table.state,
      table.userId,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: notificationKind("kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").notNull(),
    workItemId: uuid("work_item_id"),
    commentId: uuid("comment_id").references(() => workItemComments.id, {
      onDelete: "cascade",
    }),
    projectNoteId: uuid("project_note_id").references(() => projectNotes.id, {
      onDelete: "cascade",
    }),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "notifications_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "notifications_item_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "notifications_workspace_member_fk",
    }).onDelete("cascade"),
    uniqueIndex("notifications_recipient_dedupe_uidx").on(
      table.workspaceId,
      table.userId,
      table.dedupeKey,
    ),
    index("notifications_recipient_read_created_idx").on(
      table.workspaceId,
      table.userId,
      table.readAt,
      table.createdAt,
      table.id,
    ),
    index("notifications_project_recipient_idx").on(
      table.projectId,
      table.userId,
      table.createdAt,
    ),
  ],
);

export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
export type ClientLifecycle = (typeof clientLifecycle.enumValues)[number];
export type ProjectLifecycle = (typeof projectLifecycle.enumValues)[number];
export type MilestoneStatus = (typeof milestoneStatus.enumValues)[number];
export type CycleLifecycle = (typeof cycleLifecycle.enumValues)[number];
export type WorkItemStatus = (typeof workItemStatus.enumValues)[number];
export type WorkItemPriority = (typeof workItemPriority.enumValues)[number];
export type WorkPurpose = (typeof workPurpose.enumValues)[number];
export type CommercialSourceKind =
  (typeof commercialSourceKind.enumValues)[number];
export type CommercialParseState =
  (typeof commercialParseState.enumValues)[number];
export type CommercialScopeKind =
  (typeof commercialScopeKind.enumValues)[number];
export type CommercialBaselineVersionState =
  (typeof commercialBaselineVersionState.enumValues)[number];
export type CommercialScopeLineageKind =
  (typeof commercialScopeLineageKind.enumValues)[number];
export type CommercialRequestState =
  (typeof commercialRequestState.enumValues)[number];
export type CommercialDecisionDisposition =
  (typeof commercialDecisionDisposition.enumValues)[number];
export type CommercialCoverageBasis =
  (typeof commercialCoverageBasis.enumValues)[number];
export type CommercialDecisionScopeRole =
  (typeof commercialDecisionScopeRole.enumValues)[number];
export type CommercialImpactConfidence =
  (typeof commercialImpactConfidence.enumValues)[number];
export type CommercialBasisType =
  (typeof commercialBasisType.enumValues)[number];
export type WorkItemSubscriptionState =
  (typeof workItemSubscriptionState.enumValues)[number];
export type WorkItemSubscriptionSource =
  (typeof workItemSubscriptionSource.enumValues)[number];
export type NotificationKind = (typeof notificationKind.enumValues)[number];
