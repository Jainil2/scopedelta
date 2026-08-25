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
  "operator",
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

export const migrationSourceKind = pgEnum("migration_source_kind", [
  "generic_csv",
  "jira_csv",
]);
export const migrationImportState = pgEnum("migration_import_state", [
  "preview_ready",
  "committing",
  "completed",
  "completed_with_errors",
  "failed",
]);
export const migrationRowOutcome = pgEnum("migration_row_outcome", [
  "valid",
  "warning",
  "blocked",
  "created",
  "skipped",
  "failed",
]);
export const migrationObjectKind = pgEnum("migration_object_kind", [
  "project",
  "work_item",
]);

export const workPurpose = pgEnum("work_purpose", [
  "unclassified",
  "client_delivery",
  "delivery_support",
  "internal",
]);

export const deliveryTimeClassification = pgEnum(
  "delivery_time_classification",
  ["billable", "non_billable"],
);

export const aiJobKind = pgEnum("ai_job_kind", [
  "scope_change_analysis",
  "delivery_risk_brief",
  "work_context_qa_pack",
]);
export const aiJobStatus = pgEnum("ai_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export const aiAttemptStatus = pgEnum("ai_attempt_status", [
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export const aiClarificationStatus = pgEnum("ai_clarification_status", [
  "draft",
  "resolved",
  "dismissed",
]);
export const aiActionRecordType = pgEnum("ai_action_record_type", [
  "work_item",
  "clarification",
]);
export const billingSubscriptionStatus = pgEnum("billing_subscription_status", [
  "entry",
  "checkout_pending",
  "active",
  "grace",
  "canceled_paid_through",
  "expired",
]);
export const billingCheckoutStatus = pgEnum("billing_checkout_status", [
  "creating",
  "pending",
  "completed",
  "failed",
  "superseded",
]);
export const billingEventState = pgEnum("billing_event_state", [
  "processing",
  "processed",
  "ignored",
  "rejected",
  "failed",
]);
export const membershipStatus = pgEnum("membership_status", [
  "active",
  "suspended",
]);
export const workspaceLifecycleIntent = pgEnum("workspace_lifecycle_intent", [
  "closure",
  "deletion",
]);
export const workspaceLifecycleRequestState = pgEnum(
  "workspace_lifecycle_request_state",
  ["requested", "in_review", "blocked", "processed", "canceled"],
);
export const workspaceExportState = pgEnum("workspace_export_state", [
  "building",
  "ready",
  "failed",
]);
export const operatorIncidentState = pgEnum("operator_incident_state", [
  "open",
  "resolved",
]);
export const operatorIncidentSeverity = pgEnum("operator_incident_severity", [
  "warning",
  "critical",
]);
export const operatorAlertDeliveryState = pgEnum(
  "operator_alert_delivery_state",
  ["claimed", "sent", "failed"],
);
export const workspaceProductSignalOutcome = pgEnum(
  "workspace_product_signal_outcome",
  ["completed", "succeeded", "failed", "denied"],
);
export const managedUsageMetric = pgEnum("managed_usage_metric", [
  "ai_job_start",
  "email_send",
  "storage_bytes",
  "processing_unit",
]);
export const managedUsageState = pgEnum("managed_usage_state", [
  "reserved",
  "consumed",
  "released",
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

export const clientParticipantRole = pgEnum("client_participant_role", [
  "collaborator",
  "approver",
]);

export const clientProjectionTarget = pgEnum("client_projection_target", [
  "milestone",
  "deliverable",
]);

export const clientPacketRequirement = pgEnum("client_packet_requirement", [
  "informational",
  "approval",
]);

export const clientPacketAction = pgEnum("client_packet_action", [
  "approved",
  "rejected",
  "clarification_requested",
]);

export const clientAcceptanceAction = pgEnum("client_acceptance_action", [
  "accepted",
  "needs_changes",
]);

export const engineeringProvider = pgEnum("engineering_provider", ["github"]);

export const engineeringConnectionState = pgEnum(
  "engineering_connection_state",
  ["active", "disconnected", "revoked"],
);

export const implementationArtifactKind = pgEnum(
  "implementation_artifact_kind",
  ["pull_request"],
);

export const implementationArtifactState = pgEnum(
  "implementation_artifact_state",
  ["open", "draft", "closed", "merged"],
);

export const implementationReviewRollup = pgEnum(
  "implementation_review_rollup",
  ["pending", "approved", "changes_requested", "unknown"],
);

export const implementationCheckRollup = pgEnum("implementation_check_rollup", [
  "pending",
  "passing",
  "failing",
  "unknown",
]);

export const implementationLinkProvenance = pgEnum(
  "implementation_link_provenance",
  ["manual", "provider_key"],
);

export const verificationMethod = pgEnum("verification_method", [
  "manual",
  "automated_reference",
]);

export const verificationResult = pgEnum("verification_result", [
  "pending",
  "passed",
  "failed",
  "blocked",
]);

export const defectStatus = pgEnum("defect_status", ["open", "resolved"]);

export const defectSeverity = pgEnum("defect_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const providerDeliveryState = pgEnum("provider_delivery_state", [
  "processing",
  "processed",
  "ignored",
  "failed",
]);

export const clientDiscussionTarget = pgEnum("client_discussion_target", [
  "request",
  "packet",
  "acceptance_target",
]);

export const clientNotificationKind = pgEnum("client_notification_kind", [
  "request_submitted",
  "clarification_needed",
  "discussion_added",
  "packet_published",
  "packet_actioned",
  "acceptance_published",
  "acceptance_actioned",
]);

export const clientEmailDeliveryState = pgEnum("client_email_delivery_state", [
  "not_requested",
  "pending",
  "sent",
  "failed",
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

export type EffectiveEntitlements = {
  softwareCapabilities: string[];
  activeProjects: number | null;
  internalUsers: number | null;
  managedAiCredits: number;
  managedEmails: number;
  storageBytes: number;
  processingUnits: number;
};

export const workspaceBillingStates = pgTable(
  "workspace_billing_states",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    planKey: text("plan_key").notNull(),
    pendingPlanKey: text("pending_plan_key"),
    status: billingSubscriptionStatus("status").default("entry").notNull(),
    effectiveEntitlements: jsonb("effective_entitlements")
      .$type<EffectiveEntitlements>()
      .notNull(),
    periodStartsAt: timestamp("period_starts_at", { withTimezone: true }),
    periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
    paidThrough: timestamp("paid_through", { withTimezone: true }),
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    lastProviderOccurredAt: timestamp("last_provider_occurred_at", {
      withTimezone: true,
    }),
    lastProviderEventId: text("last_provider_event_id"),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("workspace_billing_provider_customer_uidx")
      .on(table.provider, table.providerCustomerId)
      .where(sql`${table.providerCustomerId} is not null`),
    uniqueIndex("workspace_billing_provider_subscription_uidx")
      .on(table.provider, table.providerSubscriptionId)
      .where(sql`${table.providerSubscriptionId} is not null`),
    index("workspace_billing_status_idx").on(table.status, table.updatedAt),
    check(
      "workspace_billing_provider_refs_consistency",
      sql`(${table.provider} is null and ${table.providerCustomerId} is null and ${table.providerSubscriptionId} is null) or ${table.provider} is not null`,
    ),
  ],
);

export const billingCheckoutAttempts = pgTable(
  "billing_checkout_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planKey: text("plan_key").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    status: billingCheckoutStatus("status").default("creating").notNull(),
    providerTransactionId: text("provider_transaction_id"),
    checkoutUrl: text("checkout_url"),
    failureCode: text("failure_code"),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("billing_checkout_workspace_idempotency_uidx").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("billing_checkout_provider_transaction_uidx")
      .on(table.providerTransactionId)
      .where(sql`${table.providerTransactionId} is not null`),
    index("billing_checkout_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    index("billing_checkout_status_updated_idx").on(
      table.status,
      table.updatedAt,
      table.id,
    ),
    check(
      "billing_checkout_pending_shape",
      sql`(${table.status} = 'pending' and ${table.providerTransactionId} is not null and ${table.checkoutUrl} is not null) or ${table.status} <> 'pending'`,
    ),
  ],
);

export const billingProviderEvents = pgTable(
  "billing_provider_events",
  {
    eventId: text("event_id").primaryKey(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    providerObjectId: text("provider_object_id"),
    payloadSha256: text("payload_sha256").notNull(),
    state: billingEventState("state").default("processing").notNull(),
    errorCode: text("error_code"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("billing_provider_events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
      table.eventId,
    ),
    index("billing_provider_events_state_received_idx").on(
      table.state,
      table.receivedAt,
    ),
    check(
      "billing_provider_events_processed_consistency",
      sql`(${table.state} = 'processing' and ${table.processedAt} is null) or (${table.state} <> 'processing' and ${table.processedAt} is not null)`,
    ),
  ],
);

export const managedUsageRecords = pgTable(
  "managed_usage_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    metric: managedUsageMetric("metric").notNull(),
    state: managedUsageState("state").default("reserved").notNull(),
    periodStartsAt: timestamp("period_starts_at", {
      withTimezone: true,
    }).notNull(),
    periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
    unitsReserved: integer("units_reserved").notNull(),
    unitsConsumed: integer("units_consumed").default(0).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("managed_usage_workspace_metric_idempotency_uidx").on(
      table.workspaceId,
      table.metric,
      table.idempotencyKey,
    ),
    index("managed_usage_workspace_metric_period_idx").on(
      table.workspaceId,
      table.metric,
      table.periodStartsAt,
      table.state,
    ),
    index("managed_usage_state_period_end_idx").on(
      table.state,
      table.periodEndsAt,
      table.workspaceId,
    ),
    check("managed_usage_reserved_positive", sql`${table.unitsReserved} > 0`),
    check(
      "managed_usage_consumed_range",
      sql`${table.unitsConsumed} >= 0 and ${table.unitsConsumed} <= ${table.unitsReserved}`,
    ),
    check(
      "managed_usage_period_order",
      sql`${table.periodStartsAt} < ${table.periodEndsAt}`,
    ),
    check(
      "managed_usage_settlement_consistency",
      sql`(${table.state} = 'reserved' and ${table.settledAt} is null) or (${table.state} <> 'reserved' and ${table.settledAt} is not null)`,
    ),
  ],
);

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
    status: membershipStatus("status").default("active").notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedByUserId: uuid("suspended_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("memberships_workspace_user_uidx").on(
      table.workspaceId,
      table.userId,
    ),
    index("memberships_user_id_idx").on(table.userId),
    index("memberships_workspace_status_role_idx").on(
      table.workspaceId,
      table.status,
      table.role,
      table.createdAt,
    ),
    check(
      "memberships_suspension_consistency",
      sql`(${table.status} = 'active' and ${table.suspendedAt} is null and ${table.suspendedByUserId} is null) or (${table.status} = 'suspended' and ${table.suspendedAt} is not null and ${table.suspendedByUserId} is not null)`,
    ),
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
    emailDeliveryState: clientEmailDeliveryState("email_delivery_state")
      .default("not_requested")
      .notNull(),
    emailAttemptCount: integer("email_attempt_count").default(0).notNull(),
    lastEmailAttemptAt: timestamp("last_email_attempt_at", {
      withTimezone: true,
    }),
    lastEmailErrorCode: text("last_email_error_code"),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("workspace_invitations_workspace_email_uidx").on(
      table.workspaceId,
      table.email,
    ),
    uniqueIndex("workspace_invitations_token_hash_uidx").on(table.tokenHash),
    index("workspace_invitations_workspace_state_expiry_idx").on(
      table.workspaceId,
      table.state,
      table.expiresAt,
      table.id,
    ),
    check(
      "workspace_invitations_attempt_count",
      sql`${table.emailAttemptCount} >= 0`,
    ),
    check(
      "workspace_invitations_error_code_length",
      sql`${table.lastEmailErrorCode} is null or char_length(${table.lastEmailErrorCode}) between 1 and 80`,
    ),
  ],
);

export const workspaceOnboardingPreferences = pgTable(
  "workspace_onboarding_preferences",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_onboarding_preferences_user_idx").on(table.userId),
  ],
);

export const workspaceExportRuns = pgTable(
  "workspace_export_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: workspaceExportState("state").default("building").notNull(),
    formatVersion: integer("format_version").default(1).notNull(),
    partCount: integer("part_count").default(0).notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }).default(0).notNull(),
    manifestSha256: text("manifest_sha256"),
    failureCode: text("failure_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    index("workspace_export_runs_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    index("workspace_export_runs_state_expiry_idx").on(
      table.state,
      table.expiresAt,
      table.id,
    ),
    check(
      "workspace_export_runs_format_positive",
      sql`${table.formatVersion} > 0`,
    ),
    check("workspace_export_runs_part_count", sql`${table.partCount} >= 0`),
    check("workspace_export_runs_total_bytes", sql`${table.totalBytes} >= 0`),
    check(
      "workspace_export_runs_state_consistency",
      sql`(${table.state} = 'building' and ${table.completedAt} is null and ${table.failureCode} is null) or (${table.state} = 'ready' and ${table.completedAt} is not null and ${table.failureCode} is null and ${table.manifestSha256} is not null and ${table.partCount} > 0) or (${table.state} = 'failed' and ${table.completedAt} is not null and ${table.failureCode} is not null)`,
    ),
  ],
);

export const workspaceExportParts = pgTable(
  "workspace_export_parts",
  {
    exportId: uuid("export_id")
      .notNull()
      .references(() => workspaceExportRuns.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    artifact: bytea("artifact").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.exportId, table.partNumber] }),
    index("workspace_export_parts_export_number_idx").on(
      table.exportId,
      table.partNumber,
    ),
    check(
      "workspace_export_parts_number_positive",
      sql`${table.partNumber} > 0`,
    ),
    check(
      "workspace_export_parts_size_cap",
      sql`${table.byteSize} between 1 and 15728639`,
    ),
    check(
      "workspace_export_parts_hash_format",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const workspaceLifecycleRequests = pgTable(
  "workspace_lifecycle_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    intent: workspaceLifecycleIntent("intent").notNull(),
    state: workspaceLifecycleRequestState("state")
      .default("requested")
      .notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    canceledByUserId: uuid("canceled_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    operatorId: uuid("operator_id"),
    exportId: uuid("export_id").references(() => workspaceExportRuns.id, {
      onDelete: "restrict",
    }),
    blockerCodes: jsonb("blocker_codes")
      .$type<string[]>()
      .default([])
      .notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("workspace_lifecycle_requests_open_uidx")
      .on(table.workspaceId)
      .where(sql`${table.state} in ('requested', 'in_review', 'blocked')`),
    index("workspace_lifecycle_requests_state_updated_idx").on(
      table.state,
      table.updatedAt,
      table.workspaceId,
    ),
    check(
      "workspace_lifecycle_requests_cancel_consistency",
      sql`(${table.state} = 'canceled' and ${table.canceledAt} is not null and ${table.canceledByUserId} is not null) or (${table.state} <> 'canceled' and ${table.canceledAt} is null and ${table.canceledByUserId} is null)`,
    ),
    check(
      "workspace_lifecycle_requests_review_consistency",
      sql`(${table.state} = 'requested' and ${table.reviewStartedAt} is null and ${table.operatorId} is null) or (${table.state} <> 'requested' and ${table.state} <> 'canceled' and ${table.reviewStartedAt} is not null and ${table.operatorId} is not null) or (${table.state} = 'canceled')`,
    ),
    check(
      "workspace_lifecycle_requests_processed_consistency",
      sql`(${table.state} = 'processed' and ${table.processedAt} is not null and ${table.exportId} is not null and jsonb_array_length(${table.blockerCodes}) = 0) or (${table.state} <> 'processed' and ${table.processedAt} is null)`,
    ),
    check(
      "workspace_lifecycle_requests_blocker_consistency",
      sql`(${table.state} = 'blocked' and jsonb_array_length(${table.blockerCodes}) > 0) or (${table.state} <> 'blocked')`,
    ),
  ],
);

export const workspaceProductSignals = pgTable(
  "workspace_product_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    outcome: workspaceProductSignalOutcome("outcome").notNull(),
    dimension: text("dimension").default("none").notNull(),
    subjectId: uuid("subject_id"),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    firstOccurredAt: timestamp("first_occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_product_signals_identity_uidx").on(
      table.workspaceId,
      table.eventType,
      table.outcome,
      table.dimension,
    ),
    index("workspace_product_signals_event_last_idx").on(
      table.eventType,
      table.lastOccurredAt,
      table.workspaceId,
    ),
    check(
      "workspace_product_signals_event_length",
      sql`char_length(${table.eventType}) between 1 and 80`,
    ),
    check(
      "workspace_product_signals_event_allowlist",
      sql`${table.eventType} in ('workspace_created', 'client_created', 'project_created', 'commercial_baseline_created', 'client_invite_created', 'client_action_recorded', 'engineering_connected', 'qa_verification_recorded', 'ai_job_completed', 'migration_import_started', 'migration_import_completed', 'billing_checkout_started', 'billing_subscription_changed', 'onboarding_step_completed', 'email_delivery', 'provider_delivery', 'entitlement_denied')`,
    ),
    check(
      "workspace_product_signals_dimension_length",
      sql`char_length(${table.dimension}) between 1 and 80`,
    ),
    check(
      "workspace_product_signals_dimension_allowlist",
      sql`${table.dimension} in ('none', 'workspace_profile', 'internal_member', 'first_client', 'first_project', 'commercial_baseline', 'client_participant', 'engineering_connection', 'qa_verification', 'ai_provider', 'billing_awareness', 'provider_unavailable', 'provider_rejected', 'configuration', 'capacity', 'lease_expired', 'validation', 'workspace_invitation', 'client_invitation', 'client_notification', 'active', 'checkout_pending', 'canceled_paid_through', 'grace', 'expired', 'entry')`,
    ),
    check(
      "workspace_product_signals_count_positive",
      sql`${table.occurrenceCount} > 0`,
    ),
    check(
      "workspace_product_signals_time_order",
      sql`${table.firstOccurredAt} <= ${table.lastOccurredAt}`,
    ),
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

export const operatorIncidents = pgTable(
  "operator_incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "restrict",
    }),
    signalType: text("signal_type").notNull(),
    severity: operatorIncidentSeverity("severity").default("warning").notNull(),
    state: operatorIncidentState("state").default("open").notNull(),
    safeErrorCode: text("safe_error_code"),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("operator_incidents_fingerprint_uidx").on(table.fingerprint),
    index("operator_incidents_state_notify_idx").on(
      table.state,
      table.lastNotifiedAt,
      table.lastObservedAt,
      table.id,
    ),
    index("operator_incidents_workspace_state_idx").on(
      table.workspaceId,
      table.state,
      table.lastObservedAt,
    ),
    check(
      "operator_incidents_fingerprint_format",
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "operator_incidents_signal_length",
      sql`char_length(${table.signalType}) between 1 and 80`,
    ),
    check(
      "operator_incidents_count_positive",
      sql`${table.occurrenceCount} > 0`,
    ),
    check(
      "operator_incidents_resolution_consistency",
      sql`(${table.state} = 'open' and ${table.resolvedAt} is null) or (${table.state} = 'resolved' and ${table.resolvedAt} is not null)`,
    ),
  ],
);

export const operatorAlertDeliveries = pgTable(
  "operator_alert_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    digestKey: text("digest_key").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    state: operatorAlertDeliveryState("state").default("claimed").notNull(),
    incidentCount: integer("incident_count").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorCode: text("error_code"),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex("operator_alert_deliveries_digest_uidx").on(table.digestKey),
    index("operator_alert_deliveries_state_claim_idx").on(
      table.state,
      table.claimedAt,
      table.id,
    ),
    check(
      "operator_alert_deliveries_digest_format",
      sql`${table.digestKey} ~ '^[0-9a-f]{64}$' and ${table.recipientHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "operator_alert_deliveries_count_positive",
      sql`${table.incidentCount} > 0`,
    ),
    check(
      "operator_alert_deliveries_state_consistency",
      sql`(${table.state} = 'claimed' and ${table.sentAt} is null and ${table.errorCode} is null) or (${table.state} = 'sent' and ${table.sentAt} is not null and ${table.errorCode} is null) or (${table.state} = 'failed' and ${table.sentAt} is null and ${table.errorCode} is not null)`,
    ),
  ],
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
    nextDefectNumber: integer("next_defect_number").default(1).notNull(),
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
    check("projects_next_defect_positive", sql`${table.nextDefectNumber} > 0`),
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

export const workspaceDeliveryAvailabilityPeriods = pgTable(
  "workspace_delivery_availability_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weeklyMinutes: integer("weekly_minutes").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    unique("workspace_delivery_availability_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("workspace_delivery_availability_start_uidx").on(
      table.workspaceId,
      table.effectiveFrom,
    ),
    index("workspace_delivery_availability_range_idx").on(
      table.workspaceId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    check(
      "workspace_delivery_availability_minutes_range",
      sql`${table.weeklyMinutes} between 0 and 10080`,
    ),
    check(
      "workspace_delivery_availability_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveFrom} <= ${table.effectiveTo}`,
    ),
    check(
      "workspace_delivery_availability_iso_weeks",
      sql`extract(isodow from ${table.effectiveFrom}) = 1 and (${table.effectiveTo} is null or extract(isodow from ${table.effectiveTo}) = 7)`,
    ),
  ],
);

export const memberDeliveryAvailabilityPeriods = pgTable(
  "member_delivery_availability_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    weeklyMinutes: integer("weekly_minutes").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "member_delivery_availability_workspace_member_fk",
    }).onDelete("cascade"),
    uniqueIndex("member_delivery_availability_start_uidx").on(
      table.workspaceId,
      table.userId,
      table.effectiveFrom,
    ),
    index("member_delivery_availability_range_idx").on(
      table.workspaceId,
      table.userId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    check(
      "member_delivery_availability_minutes_range",
      sql`${table.weeklyMinutes} between 0 and 10080`,
    ),
    check(
      "member_delivery_availability_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveFrom} <= ${table.effectiveTo}`,
    ),
    check(
      "member_delivery_availability_iso_weeks",
      sql`extract(isodow from ${table.effectiveFrom}) = 1 and (${table.effectiveTo} is null or extract(isodow from ${table.effectiveTo}) = 7)`,
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

export type ProjectTemplateDefinition = {
  projectSummary: string | null;
  milestones: Array<{
    ref: string;
    name: string;
    description: string | null;
    targetOffsetDays: number | null;
  }>;
  cycles: Array<{
    ref: string;
    name: string;
    goal: string | null;
    startOffsetDays: number;
    durationDays: number;
  }>;
  workItems: Array<{
    ref: string;
    parentRef: string | null;
    milestoneRef: string | null;
    cycleRef: string | null;
    title: string;
    description: string | null;
    acceptanceCriteria: string | null;
    status: (typeof workItemStatus.enumValues)[number];
    priority: (typeof workItemPriority.enumValues)[number];
    purpose: (typeof workPurpose.enumValues)[number];
    estimatePoints: number | null;
    targetOffsetDays: number | null;
    labels: string[];
  }>;
};

export const projectTemplates = pgTable(
  "project_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    version: integer("version").default(1).notNull(),
    definition: jsonb("definition")
      .$type<ProjectTemplateDefinition>()
      .notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("project_templates_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("project_templates_workspace_name_active_uidx")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    index("project_templates_workspace_archived_name_idx").on(
      table.workspaceId,
      table.archivedAt,
      table.name,
    ),
    check(
      "project_templates_name_length",
      sql`char_length(btrim(${table.name})) between 2 and 120`,
    ),
    check(
      "project_templates_description_length",
      sql`${table.description} is null or char_length(${table.description}) <= 2000`,
    ),
    check("project_templates_version_positive", sql`${table.version} > 0`),
  ],
);

export const projectTemplateApplications = pgTable(
  "project_template_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    projectId: uuid("project_id").notNull(),
    snapshot: jsonb("snapshot").$type<ProjectTemplateDefinition>().notNull(),
    appliedByUserId: uuid("applied_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.templateId, table.workspaceId],
      foreignColumns: [projectTemplates.id, projectTemplates.workspaceId],
      name: "project_template_applications_template_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "project_template_applications_project_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("project_template_applications_project_uidx").on(
      table.projectId,
    ),
    index("project_template_applications_template_version_idx").on(
      table.templateId,
      table.templateVersion,
      table.appliedAt,
    ),
    check(
      "project_template_applications_version_positive",
      sql`${table.templateVersion} > 0`,
    ),
  ],
);

export const migrationImportSessions = pgTable(
  "migration_import_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKind: migrationSourceKind("source_kind").notNull(),
    sourceNamespace: text("source_namespace").notNull(),
    sourceName: text("source_name").notNull(),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    state: migrationImportState("state").default("preview_ready").notNull(),
    mapping: jsonb("mapping").$type<Record<string, unknown>>().notNull(),
    options: jsonb("options").$type<Record<string, unknown>>().notNull(),
    unsupportedColumns: jsonb("unsupported_columns")
      .$type<string[]>()
      .notNull(),
    totalRows: integer("total_rows").notNull(),
    validRows: integer("valid_rows").notNull(),
    warningRows: integer("warning_rows").notNull(),
    blockedRows: integer("blocked_rows").notNull(),
    createdProjects: integer("created_projects").default(0).notNull(),
    createdWorkItems: integer("created_work_items").default(0).notNull(),
    skippedRows: integer("skipped_rows").default(0).notNull(),
    failedRows: integer("failed_rows").default(0).notNull(),
    committedAnything: boolean("committed_anything").default(false).notNull(),
    processingLeaseUntil: timestamp("processing_lease_until", {
      withTimezone: true,
    }),
    lastErrorCode: text("last_error_code"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("migration_import_sessions_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("migration_import_sessions_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    index("migration_import_sessions_workspace_state_idx").on(
      table.workspaceId,
      table.state,
      table.updatedAt,
    ),
    index("migration_import_sessions_state_lease_idx").on(
      table.state,
      table.processingLeaseUntil,
      table.id,
    ),
    check(
      "migration_import_sessions_namespace_length",
      sql`char_length(btrim(${table.sourceNamespace})) between 1 and 160`,
    ),
    check(
      "migration_import_sessions_filename_length",
      sql`char_length(btrim(${table.fileName})) between 1 and 240`,
    ),
    check(
      "migration_import_sessions_row_counts",
      sql`${table.totalRows} >= 0 and ${table.validRows} >= 0 and ${table.warningRows} >= 0 and ${table.blockedRows} >= 0 and ${table.createdProjects} >= 0 and ${table.createdWorkItems} >= 0 and ${table.skippedRows} >= 0 and ${table.failedRows} >= 0`,
    ),
  ],
);

export const migrationSourceIdentities = pgTable(
  "migration_source_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKind: migrationSourceKind("source_kind").notNull(),
    sourceNamespace: text("source_namespace").notNull(),
    identityKey: text("identity_key").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    mappedUserId: uuid("mapped_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    firstSessionId: uuid("first_session_id").notNull(),
    lastSessionId: uuid("last_session_id").notNull(),
    ...timestampColumns,
  },
  (table) => [
    unique("migration_source_identities_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    foreignKey({
      columns: [table.firstSessionId, table.workspaceId],
      foreignColumns: [
        migrationImportSessions.id,
        migrationImportSessions.workspaceId,
      ],
      name: "migration_source_identities_first_session_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.lastSessionId, table.workspaceId],
      foreignColumns: [
        migrationImportSessions.id,
        migrationImportSessions.workspaceId,
      ],
      name: "migration_source_identities_last_session_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.mappedUserId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "migration_source_identities_workspace_member_fk",
    }).onDelete("restrict"),
    uniqueIndex("migration_source_identities_identity_uidx").on(
      table.workspaceId,
      table.sourceKind,
      table.sourceNamespace,
      table.identityKey,
    ),
    index("migration_source_identities_workspace_mapping_idx").on(
      table.workspaceId,
      table.mappedUserId,
      table.updatedAt,
    ),
  ],
);

export const migrationImportSessionIdentities = pgTable(
  "migration_import_session_identities",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    identityId: uuid("identity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.sessionId, table.identityId],
      name: "migration_import_session_identities_pk",
    }),
    foreignKey({
      columns: [table.sessionId, table.workspaceId],
      foreignColumns: [
        migrationImportSessions.id,
        migrationImportSessions.workspaceId,
      ],
      name: "migration_import_session_identities_session_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.identityId, table.workspaceId],
      foreignColumns: [
        migrationSourceIdentities.id,
        migrationSourceIdentities.workspaceId,
      ],
      name: "migration_import_session_identities_identity_workspace_fk",
    }).onDelete("cascade"),
    index("migration_import_session_identities_workspace_session_idx").on(
      table.workspaceId,
      table.sessionId,
      table.identityId,
    ),
  ],
);

export const migrationImportRows = pgTable(
  "migration_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    objectKind: migrationObjectKind("object_kind")
      .default("work_item")
      .notNull(),
    sourceProjectKey: text("source_project_key").notNull(),
    sourceObjectKey: text("source_object_key").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    outcome: migrationRowOutcome("outcome").notNull(),
    normalizedData: jsonb("normalized_data")
      .$type<Record<string, unknown>>()
      .notNull(),
    messages: jsonb("messages")
      .$type<Array<{ code: string; message: string; field?: string }>>()
      .notNull(),
    targetProjectId: uuid("target_project_id"),
    targetWorkItemId: uuid("target_work_item_id"),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.workspaceId],
      foreignColumns: [
        migrationImportSessions.id,
        migrationImportSessions.workspaceId,
      ],
      name: "migration_import_rows_session_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.targetProjectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "migration_import_rows_project_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.targetWorkItemId, table.targetProjectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "migration_import_rows_work_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("migration_import_rows_session_row_uidx").on(
      table.sessionId,
      table.rowNumber,
    ),
    index("migration_import_rows_session_outcome_idx").on(
      table.sessionId,
      table.outcome,
      table.rowNumber,
    ),
    index("migration_import_rows_source_identity_idx").on(
      table.workspaceId,
      table.sourceProjectKey,
      table.sourceObjectKey,
    ),
    check("migration_import_rows_number_positive", sql`${table.rowNumber} > 1`),
  ],
);

export const migrationSourceObjects = pgTable(
  "migration_source_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKind: migrationSourceKind("source_kind").notNull(),
    sourceNamespace: text("source_namespace").notNull(),
    objectKind: migrationObjectKind("object_kind").notNull(),
    sourceProjectKey: text("source_project_key").notNull(),
    sourceObjectKey: text("source_object_key").notNull(),
    sourceUrl: text("source_url"),
    sourceFingerprint: text("source_fingerprint").notNull(),
    sourceMetadata: jsonb("source_metadata")
      .$type<Record<string, unknown>>()
      .notNull(),
    targetProjectId: uuid("target_project_id").notNull(),
    targetWorkItemId: uuid("target_work_item_id"),
    firstSessionId: uuid("first_session_id").notNull(),
    lastSessionId: uuid("last_session_id").notNull(),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.targetProjectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "migration_source_objects_project_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.targetWorkItemId, table.targetProjectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "migration_source_objects_work_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firstSessionId, table.workspaceId],
      foreignColumns: [
        migrationImportSessions.id,
        migrationImportSessions.workspaceId,
      ],
      name: "migration_source_objects_first_session_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.lastSessionId, table.workspaceId],
      foreignColumns: [
        migrationImportSessions.id,
        migrationImportSessions.workspaceId,
      ],
      name: "migration_source_objects_last_session_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("migration_source_objects_identity_uidx").on(
      table.workspaceId,
      table.sourceKind,
      table.sourceNamespace,
      table.objectKind,
      table.sourceProjectKey,
      table.sourceObjectKey,
    ),
    index("migration_source_objects_target_project_idx").on(
      table.targetProjectId,
      table.targetWorkItemId,
    ),
  ],
);

export const projectAllocations = pgTable(
  "project_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startWeek: date("start_week").notNull(),
    endWeek: date("end_week").notNull(),
    plannedMinutesPerWeek: integer("planned_minutes_per_week").notNull(),
    roleLabel: text("role_label"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...timestampColumns,
  },
  (table) => [
    unique("project_allocations_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "project_allocations_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.memberUserId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "project_allocations_workspace_member_fk",
    }).onDelete("restrict"),
    index("project_allocations_member_weeks_idx").on(
      table.workspaceId,
      table.memberUserId,
      table.startWeek,
      table.endWeek,
      table.id,
    ),
    index("project_allocations_project_weeks_idx").on(
      table.projectId,
      table.startWeek,
      table.endWeek,
      table.id,
    ),
    index("project_allocations_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    check(
      "project_allocations_date_order",
      sql`${table.startWeek} <= ${table.endWeek}`,
    ),
    check(
      "project_allocations_iso_mondays",
      sql`extract(isodow from ${table.startWeek}) = 1 and extract(isodow from ${table.endWeek}) = 1`,
    ),
    check(
      "project_allocations_minutes_range",
      sql`${table.plannedMinutesPerWeek} between 1 and 10080`,
    ),
    check(
      "project_allocations_role_label_length",
      sql`${table.roleLabel} is null or char_length(btrim(${table.roleLabel})) between 1 and 80`,
    ),
    check(
      "project_allocations_delete_consistency",
      sql`(${table.deletedAt} is null and ${table.deletedByUserId} is null) or (${table.deletedAt} is not null and ${table.deletedByUserId} is not null)`,
    ),
  ],
);

export const deliveryTimeEntries = pgTable(
  "delivery_time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workItemId: uuid("work_item_id"),
    workDate: date("work_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    classification: deliveryTimeClassification("classification").notNull(),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...timestampColumns,
  },
  (table) => [
    unique("delivery_time_entries_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "delivery_time_entries_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.memberUserId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "delivery_time_entries_workspace_member_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "delivery_time_entries_work_project_fk",
    }).onDelete("restrict"),
    index("delivery_time_entries_member_date_idx").on(
      table.workspaceId,
      table.memberUserId,
      table.workDate,
      table.id,
    ),
    index("delivery_time_entries_project_member_date_idx").on(
      table.projectId,
      table.memberUserId,
      table.workDate,
      table.id,
    ),
    index("delivery_time_entries_work_date_idx").on(
      table.workItemId,
      table.workDate,
      table.id,
    ),
    check(
      "delivery_time_entries_duration_range",
      sql`${table.durationMinutes} between 1 and 1440`,
    ),
    check(
      "delivery_time_entries_note_length",
      sql`${table.note} is null or char_length(${table.note}) <= 500`,
    ),
    check(
      "delivery_time_entries_owner_consistency",
      sql`${table.memberUserId} = ${table.createdByUserId}`,
    ),
    check(
      "delivery_time_entries_delete_consistency",
      sql`(${table.deletedAt} is null and ${table.deletedByUserId} is null) or (${table.deletedAt} is not null and ${table.deletedByUserId} is not null)`,
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

export const clientProjectParticipants = pgTable(
  "client_project_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    invitedEmail: text("invited_email").notNull(),
    role: clientParticipantRole("role").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    unique("client_participants_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("client_participants_project_user_uidx").on(
      table.projectId,
      table.userId,
    ),
    index("client_participants_user_active_idx").on(
      table.userId,
      table.revokedAt,
      table.projectId,
    ),
    check(
      "client_participants_email_length",
      sql`char_length(btrim(${table.invitedEmail})) between 3 and 320`,
    ),
    check(
      "client_participants_revoked_time",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.activatedAt}`,
    ),
  ],
);

export const clientProjectInvitations = pgTable(
  "client_project_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    email: text("email").notNull(),
    role: clientParticipantRole("role").notNull(),
    state: invitationState("state").default("pending").notNull(),
    tokenHash: text("token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acceptedParticipantId: uuid("accepted_participant_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    emailDeliveryState: clientEmailDeliveryState("email_delivery_state")
      .default("not_requested")
      .notNull(),
    emailAttemptCount: integer("email_attempt_count").default(0).notNull(),
    lastEmailAttemptAt: timestamp("last_email_attempt_at", {
      withTimezone: true,
    }),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.acceptedParticipantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "client_invitations_participant_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_invitations_token_hash_uidx").on(table.tokenHash),
    uniqueIndex("client_invitations_project_idempotency_uidx").on(
      table.projectId,
      table.idempotencyKey,
    ),
    uniqueIndex("client_invitations_pending_email_uidx")
      .on(table.projectId, sql`lower(${table.email})`)
      .where(sql`${table.state} = 'pending'`),
    index("client_invitations_project_state_idx").on(
      table.projectId,
      table.state,
      table.expiresAt,
    ),
    check(
      "client_invitations_email_length",
      sql`char_length(btrim(${table.email})) between 3 and 320`,
    ),
    check(
      "client_invitations_attempt_count",
      sql`${table.emailAttemptCount} >= 0`,
    ),
    check(
      "client_invitations_lifecycle",
      sql`(${table.state} = 'pending' and ${table.tokenHash} is not null and ${table.acceptedParticipantId} is null and ${table.acceptedAt} is null and ${table.revokedAt} is null) or (${table.state} = 'accepted' and ${table.tokenHash} is null and ${table.acceptedParticipantId} is not null and ${table.acceptedAt} is not null and ${table.revokedAt} is null) or (${table.state} = 'revoked' and ${table.tokenHash} is null and ${table.acceptedParticipantId} is null and ${table.acceptedAt} is null and ${table.revokedAt} is not null)`,
    ),
  ],
);

export const clientProjectProfiles = pgTable(
  "client_project_profiles",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    check(
      "client_project_profiles_summary_length",
      sql`char_length(btrim(${table.summary})) between 1 and 2000`,
    ),
  ],
);

export const clientProjectItems = pgTable(
  "client_project_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    target: clientProjectionTarget("target").notNull(),
    milestoneId: uuid("milestone_id"),
    scopeItemRevisionId: uuid("scope_item_revision_id"),
    clientSummary: text("client_summary").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    visibleAt: timestamp("visible_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestampColumns,
  },
  (table) => [
    unique("client_project_items_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("client_project_items_project_idempotency_uidx").on(
      table.projectId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.milestoneId, table.projectId],
      foreignColumns: [milestones.id, milestones.projectId],
      name: "client_project_items_milestone_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.scopeItemRevisionId, table.projectId],
      foreignColumns: [
        commercialScopeItemRevisions.id,
        commercialScopeItemRevisions.projectId,
      ],
      name: "client_project_items_revision_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_project_items_active_milestone_uidx")
      .on(table.projectId, table.milestoneId)
      .where(
        sql`${table.hiddenAt} is null and ${table.milestoneId} is not null`,
      ),
    uniqueIndex("client_project_items_active_revision_uidx")
      .on(table.projectId, table.scopeItemRevisionId)
      .where(
        sql`${table.hiddenAt} is null and ${table.scopeItemRevisionId} is not null`,
      ),
    index("client_project_items_project_visible_idx").on(
      table.projectId,
      table.hiddenAt,
      table.sortOrder,
      table.id,
    ),
    check(
      "client_project_items_target_shape",
      sql`(${table.target} = 'milestone' and ${table.milestoneId} is not null and ${table.scopeItemRevisionId} is null) or (${table.target} = 'deliverable' and ${table.milestoneId} is null and ${table.scopeItemRevisionId} is not null)`,
    ),
    check(
      "client_project_items_summary_length",
      sql`char_length(btrim(${table.clientSummary})) between 1 and 2000`,
    ),
    check(
      "client_project_items_hidden_time",
      sql`${table.hiddenAt} is null or ${table.hiddenAt} >= ${table.visibleAt}`,
    ),
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
    submittedByClientParticipantId: uuid("submitted_by_client_participant_id"),
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
    foreignKey({
      columns: [table.submittedByClientParticipantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "commercial_requests_client_participant_project_fk",
    }).onDelete("restrict"),
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
    index("commercial_requests_client_participant_idx").on(
      table.submittedByClientParticipantId,
      table.receivedAt,
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

export const clientCommercialPackets = pgTable(
  "client_commercial_packets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    decisionId: uuid("decision_id").notNull(),
    impactAssessmentId: uuid("impact_assessment_id"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    versionNumber: integer("version_number").notNull(),
    supersedesPacketId: uuid("supersedes_packet_id"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    requirement: clientPacketRequirement("requirement").notNull(),
    title: text("title").notNull(),
    requestSummary: text("request_summary").notNull(),
    treatmentSummary: text("treatment_summary").notNull(),
    scopeSummary: text("scope_summary"),
    assumptions: text("assumptions"),
    scheduleDeltaDays: integer("schedule_delta_days"),
    targetDate: date("target_date"),
    monetaryAmount: numeric("monetary_amount", { precision: 18, scale: 2 }),
    currencyCode: text("currency_code"),
    publishedByUserId: uuid("published_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("client_packets_id_project_unique").on(table.id, table.projectId),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "client_packets_request_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.decisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "client_packets_decision_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.impactAssessmentId, table.projectId],
      foreignColumns: [
        commercialImpactAssessments.id,
        commercialImpactAssessments.projectId,
      ],
      name: "client_packets_impact_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.supersedesPacketId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "client_packets_supersedes_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_packets_request_version_uidx").on(
      table.requestId,
      table.versionNumber,
    ),
    uniqueIndex("client_packets_request_idempotency_uidx").on(
      table.requestId,
      table.idempotencyKey,
    ),
    uniqueIndex("client_packets_supersedes_uidx").on(table.supersedesPacketId),
    uniqueIndex("client_packets_current_request_uidx")
      .on(table.requestId)
      .where(sql`${table.supersededAt} is null`),
    index("client_packets_project_published_idx").on(
      table.projectId,
      table.publishedAt,
      table.id,
    ),
    check("client_packets_version_positive", sql`${table.versionNumber} > 0`),
    check(
      "client_packets_title_length",
      sql`char_length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      "client_packets_request_summary_length",
      sql`char_length(btrim(${table.requestSummary})) between 1 and 5000`,
    ),
    check(
      "client_packets_treatment_summary_length",
      sql`char_length(btrim(${table.treatmentSummary})) between 1 and 5000`,
    ),
    check(
      "client_packets_optional_text_length",
      sql`(${table.scopeSummary} is null or char_length(${table.scopeSummary}) <= 5000) and (${table.assumptions} is null or char_length(${table.assumptions}) <= 5000)`,
    ),
    check(
      "client_packets_money_pair",
      sql`(${table.monetaryAmount} is null and ${table.currencyCode} is null) or (${table.monetaryAmount} is not null and ${table.currencyCode} ~ '^[A-Z]{3}$')`,
    ),
    check(
      "client_packets_superseded_time",
      sql`${table.supersededAt} is null or ${table.supersededAt} >= ${table.publishedAt}`,
    ),
  ],
);

export const clientCommercialPacketScopeReferences = pgTable(
  "client_commercial_packet_scope_references",
  {
    packetId: uuid("packet_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scopeItemRevisionId: uuid("scope_item_revision_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.packetId, table.scopeItemRevisionId] }),
    foreignKey({
      columns: [table.packetId, table.projectId],
      foreignColumns: [
        clientCommercialPackets.id,
        clientCommercialPackets.projectId,
      ],
      name: "client_packet_scope_refs_packet_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.scopeItemRevisionId, table.projectId],
      foreignColumns: [
        commercialScopeItemRevisions.id,
        commercialScopeItemRevisions.projectId,
      ],
      name: "client_packet_scope_refs_revision_project_fk",
    }).onDelete("restrict"),
  ],
);

export const clientCommercialPacketActions = pgTable(
  "client_commercial_packet_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    packetId: uuid("packet_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    action: clientPacketAction("action").notNull(),
    comment: text("comment"),
    actedAt: timestamp("acted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("client_packet_actions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.packetId, table.projectId],
      foreignColumns: [
        clientCommercialPackets.id,
        clientCommercialPackets.projectId,
      ],
      name: "client_packet_actions_packet_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.participantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "client_packet_actions_participant_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_packet_actions_packet_uidx").on(table.packetId),
    uniqueIndex("client_packet_actions_idempotency_uidx").on(
      table.packetId,
      table.idempotencyKey,
    ),
    index("client_packet_actions_project_acted_idx").on(
      table.projectId,
      table.actedAt,
      table.id,
    ),
    check(
      "client_packet_actions_comment_length",
      sql`${table.comment} is null or char_length(${table.comment}) <= 5000`,
    ),
  ],
);

export const clientAcceptanceTargets = pgTable(
  "client_acceptance_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    projectItemId: uuid("project_item_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    versionNumber: integer("version_number").notNull(),
    supersedesTargetId: uuid("supersedes_target_id"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    snapshotTitle: text("snapshot_title").notNull(),
    snapshotSummary: text("snapshot_summary").notNull(),
    snapshotStatus: text("snapshot_status"),
    snapshotTargetDate: date("snapshot_target_date"),
    milestoneSourceUpdatedAt: timestamp("milestone_source_updated_at", {
      withTimezone: true,
    }),
    publishedByUserId: uuid("published_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("client_acceptance_targets_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.projectItemId, table.projectId],
      foreignColumns: [clientProjectItems.id, clientProjectItems.projectId],
      name: "client_acceptance_targets_item_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.supersedesTargetId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "client_acceptance_targets_supersedes_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_acceptance_targets_item_version_uidx").on(
      table.projectItemId,
      table.versionNumber,
    ),
    uniqueIndex("client_acceptance_targets_item_idempotency_uidx").on(
      table.projectItemId,
      table.idempotencyKey,
    ),
    uniqueIndex("client_acceptance_targets_supersedes_uidx").on(
      table.supersedesTargetId,
    ),
    uniqueIndex("client_acceptance_targets_current_item_uidx")
      .on(table.projectItemId)
      .where(sql`${table.supersededAt} is null`),
    index("client_acceptance_targets_project_published_idx").on(
      table.projectId,
      table.publishedAt,
      table.id,
    ),
    check(
      "client_acceptance_targets_version_positive",
      sql`${table.versionNumber} > 0`,
    ),
    check(
      "client_acceptance_targets_title_length",
      sql`char_length(btrim(${table.snapshotTitle})) between 1 and 240`,
    ),
    check(
      "client_acceptance_targets_summary_length",
      sql`char_length(btrim(${table.snapshotSummary})) between 1 and 5000`,
    ),
    check(
      "client_acceptance_targets_status_length",
      sql`${table.snapshotStatus} is null or char_length(${table.snapshotStatus}) <= 80`,
    ),
    check(
      "client_acceptance_targets_superseded_time",
      sql`${table.supersededAt} is null or ${table.supersededAt} >= ${table.publishedAt}`,
    ),
  ],
);

export const clientAcceptanceTargetPackets = pgTable(
  "client_acceptance_target_packets",
  {
    acceptanceTargetId: uuid("acceptance_target_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    packetId: uuid("packet_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.acceptanceTargetId, table.packetId] }),
    foreignKey({
      columns: [table.acceptanceTargetId, table.projectId],
      foreignColumns: [
        clientAcceptanceTargets.id,
        clientAcceptanceTargets.projectId,
      ],
      name: "client_acceptance_target_packets_target_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.packetId, table.projectId],
      foreignColumns: [
        clientCommercialPackets.id,
        clientCommercialPackets.projectId,
      ],
      name: "client_acceptance_target_packets_packet_project_fk",
    }).onDelete("restrict"),
  ],
);

export const clientAcceptanceActions = pgTable(
  "client_acceptance_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    acceptanceTargetId: uuid("acceptance_target_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    action: clientAcceptanceAction("action").notNull(),
    comment: text("comment"),
    actedAt: timestamp("acted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("client_acceptance_actions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.acceptanceTargetId, table.projectId],
      foreignColumns: [
        clientAcceptanceTargets.id,
        clientAcceptanceTargets.projectId,
      ],
      name: "client_acceptance_actions_target_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.participantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "client_acceptance_actions_participant_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_acceptance_actions_target_uidx").on(
      table.acceptanceTargetId,
    ),
    uniqueIndex("client_acceptance_actions_idempotency_uidx").on(
      table.acceptanceTargetId,
      table.idempotencyKey,
    ),
    index("client_acceptance_actions_project_acted_idx").on(
      table.projectId,
      table.actedAt,
      table.id,
    ),
    check(
      "client_acceptance_actions_comment_length",
      sql`${table.comment} is null or char_length(${table.comment}) <= 5000`,
    ),
  ],
);

export const clientDiscussionMessages = pgTable(
  "client_discussion_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    target: clientDiscussionTarget("target").notNull(),
    requestId: uuid("request_id"),
    packetId: uuid("packet_id"),
    acceptanceTargetId: uuid("acceptance_target_id"),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    authorParticipantId: uuid("author_participant_id"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("client_discussion_messages_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "client_discussion_messages_request_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.packetId, table.projectId],
      foreignColumns: [
        clientCommercialPackets.id,
        clientCommercialPackets.projectId,
      ],
      name: "client_discussion_messages_packet_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.acceptanceTargetId, table.projectId],
      foreignColumns: [
        clientAcceptanceTargets.id,
        clientAcceptanceTargets.projectId,
      ],
      name: "client_discussion_messages_acceptance_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.authorParticipantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "client_discussion_messages_participant_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("client_discussion_messages_author_idempotency_uidx").on(
      table.authorUserId,
      table.idempotencyKey,
    ),
    index("client_discussion_messages_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    check(
      "client_discussion_messages_target_shape",
      sql`(${table.target} = 'request' and ${table.requestId} is not null and ${table.packetId} is null and ${table.acceptanceTargetId} is null) or (${table.target} = 'packet' and ${table.requestId} is null and ${table.packetId} is not null and ${table.acceptanceTargetId} is null) or (${table.target} = 'acceptance_target' and ${table.requestId} is null and ${table.packetId} is null and ${table.acceptanceTargetId} is not null)`,
    ),
    check(
      "client_discussion_messages_body_length",
      sql`char_length(btrim(${table.body})) between 1 and 5000`,
    ),
  ],
);

export const clientCollaborationNotifications = pgTable(
  "client_collaboration_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recipientParticipantId: uuid("recipient_participant_id"),
    kind: clientNotificationKind("kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    actorParticipantId: uuid("actor_participant_id"),
    requestId: uuid("request_id"),
    packetId: uuid("packet_id"),
    acceptanceTargetId: uuid("acceptance_target_id"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailDeliveryState: clientEmailDeliveryState("email_delivery_state")
      .default("not_requested")
      .notNull(),
    emailAttemptCount: integer("email_attempt_count").default(0).notNull(),
    lastEmailAttemptAt: timestamp("last_email_attempt_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "client_notifications_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recipientParticipantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "client_notifications_recipient_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actorParticipantId, table.projectId],
      foreignColumns: [
        clientProjectParticipants.id,
        clientProjectParticipants.projectId,
      ],
      name: "client_notifications_actor_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "client_notifications_request_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.packetId, table.projectId],
      foreignColumns: [
        clientCommercialPackets.id,
        clientCommercialPackets.projectId,
      ],
      name: "client_notifications_packet_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.acceptanceTargetId, table.projectId],
      foreignColumns: [
        clientAcceptanceTargets.id,
        clientAcceptanceTargets.projectId,
      ],
      name: "client_notifications_acceptance_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("client_notifications_recipient_dedupe_uidx").on(
      table.recipientUserId,
      table.dedupeKey,
    ),
    index("client_notifications_recipient_unread_idx").on(
      table.recipientUserId,
      table.readAt,
      table.createdAt,
      table.id,
    ),
    index("client_notifications_project_recipient_idx").on(
      table.projectId,
      table.recipientUserId,
      table.createdAt,
    ),
    check(
      "client_notifications_dedupe_length",
      sql`char_length(${table.dedupeKey}) between 1 and 200`,
    ),
    check(
      "client_notifications_attempt_count",
      sql`${table.emailAttemptCount} >= 0`,
    ),
    check(
      "client_notifications_target",
      sql`${table.requestId} is not null or ${table.packetId} is not null or ${table.acceptanceTargetId} is not null`,
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

export const engineeringProviderInstallations = pgTable(
  "engineering_provider_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: engineeringProvider("provider").notNull(),
    providerInstallationId: text("provider_installation_id").notNull(),
    accountId: text("account_id").notNull(),
    accountLogin: text("account_login").notNull(),
    state: engineeringConnectionState("state").default("active").notNull(),
    connectedByUserId: uuid("connected_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    disconnectedByUserId: uuid("disconnected_by_user_id").references(
      () => users.id,
      { onDelete: "restrict" },
    ),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("engineering_installations_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("engineering_installations_provider_identity_uidx").on(
      table.provider,
      table.providerInstallationId,
    ),
    index("engineering_installations_workspace_state_idx").on(
      table.workspaceId,
      table.state,
      table.id,
    ),
    check(
      "engineering_installations_disconnect_consistency",
      sql`(${table.state} = 'active' and ${table.disconnectedAt} is null and ${table.disconnectedByUserId} is null) or (${table.state} <> 'active' and ${table.disconnectedAt} is not null)`,
    ),
  ],
);

export const engineeringRepositories = pgTable(
  "engineering_repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id").notNull(),
    provider: engineeringProvider("provider").notNull(),
    providerRepositoryId: text("provider_repository_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    url: text("url").notNull(),
    defaultBranch: text("default_branch").notNull(),
    private: boolean("private").notNull(),
    state: engineeringConnectionState("state").default("active").notNull(),
    connectedByUserId: uuid("connected_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    staleAt: timestamp("stale_at", { withTimezone: true }),
    lastSyncErrorCode: text("last_sync_error_code"),
    disconnectedByUserId: uuid("disconnected_by_user_id").references(
      () => users.id,
      { onDelete: "restrict" },
    ),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("engineering_repositories_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    unique("engineering_repositories_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "engineering_repositories_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.installationId, table.workspaceId],
      foreignColumns: [
        engineeringProviderInstallations.id,
        engineeringProviderInstallations.workspaceId,
      ],
      name: "engineering_repositories_installation_workspace_fk",
    }).onDelete("restrict"),
    uniqueIndex("engineering_repositories_project_provider_uidx").on(
      table.projectId,
      table.provider,
      table.providerRepositoryId,
    ),
    index("engineering_repositories_workspace_provider_idx").on(
      table.workspaceId,
      table.provider,
      table.providerRepositoryId,
    ),
    index("engineering_repositories_project_state_idx").on(
      table.projectId,
      table.state,
      table.id,
    ),
    index("engineering_repositories_state_stale_idx").on(
      table.state,
      table.staleAt,
      table.id,
    ),
    check(
      "engineering_repositories_disconnect_consistency",
      sql`(${table.state} = 'active' and ${table.disconnectedAt} is null and ${table.disconnectedByUserId} is null) or (${table.state} <> 'active' and ${table.disconnectedAt} is not null)`,
    ),
  ],
);

export const implementationArtifacts = pgTable(
  "implementation_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull(),
    provider: engineeringProvider("provider").notNull(),
    kind: implementationArtifactKind("kind").notNull(),
    providerArtifactId: text("provider_artifact_id").notNull(),
    number: integer("number").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    state: implementationArtifactState("state").notNull(),
    headRef: text("head_ref"),
    headSha: text("head_sha"),
    baseBranch: text("base_branch").notNull(),
    authorRef: text("author_ref"),
    reviewRollup: implementationReviewRollup("review_rollup").notNull(),
    approvalsCount: integer("approvals_count").default(0).notNull(),
    changesRequestedCount: integer("changes_requested_count")
      .default(0)
      .notNull(),
    checkRollup: implementationCheckRollup("check_rollup").notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergeCommitSha: text("merge_commit_sha"),
    providerUpdatedAt: timestamp("provider_updated_at", {
      withTimezone: true,
    }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    staleAt: timestamp("stale_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("implementation_artifacts_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.repositoryId, table.projectId],
      foreignColumns: [
        engineeringRepositories.id,
        engineeringRepositories.projectId,
      ],
      name: "implementation_artifacts_repository_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("implementation_artifacts_repository_provider_uidx").on(
      table.repositoryId,
      table.providerArtifactId,
    ),
    index("implementation_artifacts_project_updated_idx").on(
      table.projectId,
      table.providerUpdatedAt,
      table.id,
    ),
    check("implementation_artifacts_number_positive", sql`${table.number} > 0`),
    check(
      "implementation_artifacts_review_counts_nonnegative",
      sql`${table.approvalsCount} >= 0 and ${table.changesRequestedCount} >= 0`,
    ),
  ],
);

export const implementationArtifactSnapshots = pgTable(
  "implementation_artifact_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    state: implementationArtifactState("state").notNull(),
    headSha: text("head_sha"),
    reviewRollup: implementationReviewRollup("review_rollup").notNull(),
    approvalsCount: integer("approvals_count").notNull(),
    changesRequestedCount: integer("changes_requested_count").notNull(),
    checkRollup: implementationCheckRollup("check_rollup").notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergeCommitSha: text("merge_commit_sha"),
    providerUpdatedAt: timestamp("provider_updated_at", {
      withTimezone: true,
    }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("implementation_snapshots_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.artifactId, table.projectId],
      foreignColumns: [
        implementationArtifacts.id,
        implementationArtifacts.projectId,
      ],
      name: "implementation_snapshots_artifact_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("implementation_snapshots_artifact_fingerprint_uidx").on(
      table.artifactId,
      table.fingerprint,
    ),
    index("implementation_snapshots_artifact_captured_idx").on(
      table.artifactId,
      table.capturedAt,
      table.id,
    ),
  ],
);

export const workImplementationLinks = pgTable(
  "work_implementation_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
    provenance: implementationLinkProvenance("provenance").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_implementation_links_work_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId, table.projectId],
      foreignColumns: [
        implementationArtifacts.id,
        implementationArtifacts.projectId,
      ],
      name: "work_implementation_links_artifact_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("work_implementation_links_pair_uidx").on(
      table.workItemId,
      table.artifactId,
    ),
    index("work_implementation_links_project_artifact_idx").on(
      table.projectId,
      table.artifactId,
    ),
    check(
      "work_implementation_links_actor_consistency",
      sql`(${table.provenance} = 'manual' and ${table.createdByUserId} is not null) or ${table.provenance} = 'provider_key'`,
    ),
    check(
      "work_implementation_links_removed_consistency",
      sql`(${table.removedAt} is null and ${table.removedByUserId} is null) or (${table.removedAt} is not null and ${table.removedByUserId} is not null)`,
    ),
  ],
);

export const verificationRecords = pgTable(
  "verification_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id"),
    scopeItemRevisionId: uuid("scope_item_revision_id"),
    artifactId: uuid("artifact_id"),
    milestoneId: uuid("milestone_id"),
    acceptanceTargetId: uuid("acceptance_target_id"),
    method: verificationMethod("method").notNull(),
    category: text("category").notNull(),
    result: verificationResult("result").notNull(),
    referenceUrl: text("reference_url"),
    notes: text("notes"),
    subjectFingerprint: text("subject_fingerprint"),
    implementationSetFingerprint: text("implementation_set_fingerprint"),
    artifactHeadSha: text("artifact_head_sha"),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("verification_records_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "verification_records_work_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.scopeItemRevisionId, table.projectId],
      foreignColumns: [
        commercialScopeItemRevisions.id,
        commercialScopeItemRevisions.projectId,
      ],
      name: "verification_records_scope_revision_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId, table.projectId],
      foreignColumns: [
        implementationArtifacts.id,
        implementationArtifacts.projectId,
      ],
      name: "verification_records_artifact_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.milestoneId, table.projectId],
      foreignColumns: [milestones.id, milestones.projectId],
      name: "verification_records_milestone_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.acceptanceTargetId, table.projectId],
      foreignColumns: [
        clientAcceptanceTargets.id,
        clientAcceptanceTargets.projectId,
      ],
      name: "verification_records_acceptance_project_fk",
    }).onDelete("restrict"),
    index("verification_records_project_recorded_idx").on(
      table.projectId,
      table.recordedAt,
      table.id,
    ),
    index("verification_records_work_recorded_idx").on(
      table.workItemId,
      table.recordedAt,
      table.id,
    ),
    check(
      "verification_records_target_required",
      sql`num_nonnulls(${table.workItemId}, ${table.scopeItemRevisionId}, ${table.artifactId}, ${table.milestoneId}, ${table.acceptanceTargetId}) > 0`,
    ),
    check(
      "verification_records_category_length",
      sql`char_length(btrim(${table.category})) between 1 and 80`,
    ),
    check(
      "verification_records_notes_length",
      sql`${table.notes} is null or char_length(${table.notes}) <= 5000`,
    ),
  ],
);

export const defects = pgTable(
  "defects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: defectStatus("status").default("open").notNull(),
    severity: defectSeverity("severity").notNull(),
    workItemId: uuid("work_item_id"),
    scopeItemRevisionId: uuid("scope_item_revision_id"),
    commercialRequestId: uuid("commercial_request_id"),
    commercialDecisionId: uuid("commercial_decision_id"),
    artifactId: uuid("artifact_id"),
    verificationId: uuid("verification_id"),
    milestoneId: uuid("milestone_id"),
    acceptanceTargetId: uuid("acceptance_target_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("defects_id_project_unique").on(table.id, table.projectId),
    uniqueIndex("defects_project_number_uidx").on(
      table.projectId,
      table.number,
    ),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "defects_work_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.scopeItemRevisionId, table.projectId],
      foreignColumns: [
        commercialScopeItemRevisions.id,
        commercialScopeItemRevisions.projectId,
      ],
      name: "defects_scope_revision_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.commercialRequestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "defects_request_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.commercialDecisionId, table.projectId],
      foreignColumns: [commercialDecisions.id, commercialDecisions.projectId],
      name: "defects_decision_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId, table.projectId],
      foreignColumns: [
        implementationArtifacts.id,
        implementationArtifacts.projectId,
      ],
      name: "defects_artifact_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.verificationId, table.projectId],
      foreignColumns: [verificationRecords.id, verificationRecords.projectId],
      name: "defects_verification_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.milestoneId, table.projectId],
      foreignColumns: [milestones.id, milestones.projectId],
      name: "defects_milestone_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.acceptanceTargetId, table.projectId],
      foreignColumns: [
        clientAcceptanceTargets.id,
        clientAcceptanceTargets.projectId,
      ],
      name: "defects_acceptance_project_fk",
    }).onDelete("restrict"),
    index("defects_project_status_detected_idx").on(
      table.projectId,
      table.status,
      table.detectedAt,
      table.id,
    ),
    check("defects_number_positive", sql`${table.number} > 0`),
    check(
      "defects_title_length",
      sql`char_length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      "defects_description_length",
      sql`${table.description} is null or char_length(${table.description}) <= 10000`,
    ),
    check(
      "defects_resolution_consistency",
      sql`(${table.status} = 'open' and ${table.resolvedAt} is null and ${table.resolvedByUserId} is null) or (${table.status} = 'resolved' and ${table.resolvedAt} is not null and ${table.resolvedByUserId} is not null)`,
    ),
  ],
);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: aiJobKind("kind").notNull(),
    status: aiJobStatus("status").default("queued").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestId: uuid("request_id"),
    milestoneId: uuid("milestone_id"),
    workItemId: uuid("work_item_id"),
    promptVersion: text("prompt_version").notNull(),
    contextSnapshot: jsonb("context_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    evidenceMap: jsonb("evidence_map")
      .$type<Record<string, unknown>>()
      .notNull(),
    contextFingerprint: text("context_fingerprint").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    providerBaseUrl: text("provider_base_url").notNull(),
    executionConfigFingerprint: text("execution_config_fingerprint").notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "ai_jobs_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "ai_jobs_request_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.milestoneId, table.projectId],
      foreignColumns: [milestones.id, milestones.projectId],
      name: "ai_jobs_milestone_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "ai_jobs_work_project_fk",
    }).onDelete("restrict"),
    uniqueIndex("ai_jobs_project_creator_idempotency_uidx").on(
      table.projectId,
      table.createdByUserId,
      table.idempotencyKey,
    ),
    index("ai_jobs_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    index("ai_jobs_status_lease_idx").on(table.status, table.leaseExpiresAt),
    check(
      "ai_jobs_target_shape",
      sql`(${table.kind} = 'scope_change_analysis' and ${table.requestId} is not null and ${table.milestoneId} is null and ${table.workItemId} is null) or (${table.kind} = 'delivery_risk_brief' and ${table.requestId} is null and ${table.workItemId} is null) or (${table.kind} = 'work_context_qa_pack' and ${table.requestId} is null and ${table.milestoneId} is null and ${table.workItemId} is not null)`,
    ),
    check(
      "ai_jobs_lease_consistency",
      sql`(${table.status} = 'running' and ${table.leaseOwner} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'running' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null)`,
    ),
  ],
);

export const aiJobAttempts = pgTable(
  "ai_job_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: aiAttemptStatus("status").default("running").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    providerBaseUrl: text("provider_base_url").notNull(),
    executionConfigFingerprint: text("execution_config_fingerprint").notNull(),
    managedUsageRecordId: uuid("managed_usage_record_id").references(
      () => managedUsageRecords.id,
      { onDelete: "restrict" },
    ),
    providerRequestId: text("provider_request_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ai_job_attempts_job_number_uidx").on(
      table.jobId,
      table.attemptNumber,
    ),
    uniqueIndex("ai_job_attempts_managed_usage_uidx")
      .on(table.managedUsageRecordId)
      .where(sql`${table.managedUsageRecordId} is not null`),
    index("ai_job_attempts_job_started_idx").on(
      table.jobId,
      table.startedAt,
      table.id,
    ),
    check("ai_job_attempts_number_positive", sql`${table.attemptNumber} > 0`),
  ],
);

export const aiActionExecutions = pgTable(
  "ai_action_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    confirmedByUserId: uuid("confirmed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    selection: jsonb("selection")
      .$type<{
        workCandidateKeys: string[];
        clarificationCandidateKeys: string[];
      }>()
      .notNull(),
    contextFingerprint: text("context_fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ai_action_executions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("ai_action_executions_job_idempotency_uidx").on(
      table.jobId,
      table.idempotencyKey,
    ),
    index("ai_action_executions_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const commercialRequestClarifications = pgTable(
  "commercial_request_clarifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    question: text("question").notNull(),
    status: aiClarificationStatus("status").default("draft").notNull(),
    originatingJobId: uuid("originating_job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    unique("commercial_request_clarifications_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.requestId, table.projectId],
      foreignColumns: [commercialRequests.id, commercialRequests.projectId],
      name: "commercial_request_clarifications_request_project_fk",
    }).onDelete("cascade"),
    index("commercial_request_clarifications_request_status_idx").on(
      table.requestId,
      table.status,
      table.createdAt,
      table.id,
    ),
    check(
      "commercial_request_clarifications_question_length",
      sql`char_length(btrim(${table.question})) between 1 and 2000`,
    ),
    check(
      "commercial_request_clarifications_resolution_consistency",
      sql`(${table.status} = 'draft' and ${table.resolvedAt} is null and ${table.resolvedByUserId} is null) or (${table.status} <> 'draft' and ${table.resolvedAt} is not null and ${table.resolvedByUserId} is not null)`,
    ),
  ],
);

export const aiActionRecords = pgTable(
  "ai_action_records",
  {
    executionId: uuid("execution_id")
      .notNull()
      .references(() => aiActionExecutions.id, { onDelete: "cascade" }),
    candidateKey: text("candidate_key").notNull(),
    recordType: aiActionRecordType("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.executionId, table.candidateKey] }),
    index("ai_action_records_record_idx").on(table.recordType, table.recordId),
  ],
);

export const providerWebhookDeliveries = pgTable(
  "provider_webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: engineeringProvider("provider").notNull(),
    deliveryId: text("delivery_id").notNull(),
    eventName: text("event_name").notNull(),
    repositoryId: uuid("repository_id").references(
      () => engineeringRepositories.id,
      { onDelete: "restrict" },
    ),
    state: providerDeliveryState("state").default("processing").notNull(),
    errorCode: text("error_code"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("provider_webhook_deliveries_identity_uidx").on(
      table.provider,
      table.deliveryId,
    ),
    index("provider_webhook_deliveries_received_idx").on(
      table.provider,
      table.receivedAt,
      table.id,
    ),
    index("provider_webhook_deliveries_state_received_idx").on(
      table.state,
      table.receivedAt,
      table.id,
    ),
    check(
      "provider_webhook_deliveries_processed_consistency",
      sql`(${table.state} = 'processing' and ${table.processedAt} is null) or (${table.state} <> 'processing' and ${table.processedAt} is not null)`,
    ),
  ],
);

export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];
export type WorkspaceLifecycleIntent =
  (typeof workspaceLifecycleIntent.enumValues)[number];
export type WorkspaceLifecycleRequestState =
  (typeof workspaceLifecycleRequestState.enumValues)[number];
export type WorkspaceExportState =
  (typeof workspaceExportState.enumValues)[number];
export type OperatorIncidentState =
  (typeof operatorIncidentState.enumValues)[number];
export type OperatorIncidentSeverity =
  (typeof operatorIncidentSeverity.enumValues)[number];
export type OperatorAlertDeliveryState =
  (typeof operatorAlertDeliveryState.enumValues)[number];
export type WorkspaceProductSignalOutcome =
  (typeof workspaceProductSignalOutcome.enumValues)[number];
export type ClientLifecycle = (typeof clientLifecycle.enumValues)[number];
export type ProjectLifecycle = (typeof projectLifecycle.enumValues)[number];
export type MilestoneStatus = (typeof milestoneStatus.enumValues)[number];
export type CycleLifecycle = (typeof cycleLifecycle.enumValues)[number];
export type WorkItemStatus = (typeof workItemStatus.enumValues)[number];
export type WorkItemPriority = (typeof workItemPriority.enumValues)[number];
export type WorkPurpose = (typeof workPurpose.enumValues)[number];
export type MigrationSourceKind =
  (typeof migrationSourceKind.enumValues)[number];
export type MigrationImportState =
  (typeof migrationImportState.enumValues)[number];
export type MigrationRowOutcome =
  (typeof migrationRowOutcome.enumValues)[number];
export type MigrationObjectKind =
  (typeof migrationObjectKind.enumValues)[number];
export type AiJobKind = (typeof aiJobKind.enumValues)[number];
export type AiJobStatus = (typeof aiJobStatus.enumValues)[number];
export type AiAttemptStatus = (typeof aiAttemptStatus.enumValues)[number];
export type AiClarificationStatus =
  (typeof aiClarificationStatus.enumValues)[number];
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
export type ClientParticipantRole =
  (typeof clientParticipantRole.enumValues)[number];
export type ClientProjectionTarget =
  (typeof clientProjectionTarget.enumValues)[number];
export type ClientPacketRequirement =
  (typeof clientPacketRequirement.enumValues)[number];
export type ClientPacketAction = (typeof clientPacketAction.enumValues)[number];
export type ClientAcceptanceAction =
  (typeof clientAcceptanceAction.enumValues)[number];
export type EngineeringProvider =
  (typeof engineeringProvider.enumValues)[number];
export type EngineeringConnectionState =
  (typeof engineeringConnectionState.enumValues)[number];
export type ImplementationArtifactKind =
  (typeof implementationArtifactKind.enumValues)[number];
export type ImplementationArtifactState =
  (typeof implementationArtifactState.enumValues)[number];
export type ImplementationReviewRollup =
  (typeof implementationReviewRollup.enumValues)[number];
export type ImplementationCheckRollup =
  (typeof implementationCheckRollup.enumValues)[number];
export type ImplementationLinkProvenance =
  (typeof implementationLinkProvenance.enumValues)[number];
export type VerificationMethod = (typeof verificationMethod.enumValues)[number];
export type VerificationResult = (typeof verificationResult.enumValues)[number];
export type DefectStatus = (typeof defectStatus.enumValues)[number];
export type DefectSeverity = (typeof defectSeverity.enumValues)[number];
export type ProviderDeliveryState =
  (typeof providerDeliveryState.enumValues)[number];
export type ClientDiscussionTarget =
  (typeof clientDiscussionTarget.enumValues)[number];
export type ClientNotificationKind =
  (typeof clientNotificationKind.enumValues)[number];
export type ClientEmailDeliveryState =
  (typeof clientEmailDeliveryState.enumValues)[number];
export type WorkItemSubscriptionState =
  (typeof workItemSubscriptionState.enumValues)[number];
export type WorkItemSubscriptionSource =
  (typeof workItemSubscriptionSource.enumValues)[number];
export type NotificationKind = (typeof notificationKind.enumValues)[number];
export type BillingSubscriptionStatus =
  (typeof billingSubscriptionStatus.enumValues)[number];
export type BillingCheckoutStatus =
  (typeof billingCheckoutStatus.enumValues)[number];
export type BillingEventState = (typeof billingEventState.enumValues)[number];
export type ManagedUsageMetric = (typeof managedUsageMetric.enumValues)[number];
export type ManagedUsageState = (typeof managedUsageState.enumValues)[number];
