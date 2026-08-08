import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
export type WorkItemSubscriptionState =
  (typeof workItemSubscriptionState.enumValues)[number];
export type WorkItemSubscriptionSource =
  (typeof workItemSubscriptionSource.enumValues)[number];
export type NotificationKind = (typeof notificationKind.enumValues)[number];
