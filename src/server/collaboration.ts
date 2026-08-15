import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  memberships,
  notifications,
  projectMemberships,
  projectNoteMentions,
  projectNotes,
  projects,
  users,
  workItemCommentMentions,
  workItemCommentRevisions,
  workItemComments,
  workItemSubscriptions,
  workItems,
  type NotificationKind,
} from "@/db/schema";
import type {
  ActivityFilters,
  CreateCommentInput,
  CreateProjectNoteInput,
  NotificationFilters,
  ProjectNoteFilters,
  UpdateCommentInput,
  UpdateProjectNoteInput,
} from "@/lib/collaboration-validation";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import {
  assertWritableProject,
  getProjectAccess,
  insertAudit,
  type Executor,
  type Transaction,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";

const MAX_ACTIVE_PROJECT_NOTES = 20;
const COLLABORATION_BATCH_SIZE = 100;
const MENTION =
  /@\[([^\]\n]{1,100})\]\(user:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\)/gi;

const conflict = (code: string, message: string) =>
  new PlatformError(code, 409, message);

function pageResult<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    data,
    page: {
      number: page,
      size: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    },
  };
}

async function getWorkspaceRole(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
) {
  const rows = await database
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0].role;
}

async function getScopedWorkItem(
  database: Executor,
  projectId: string,
  workItemId: string,
) {
  const rows = await database
    .select({
      id: workItems.id,
      number: workItems.number,
      title: workItems.title,
      assigneeUserId: workItems.assigneeUserId,
      archivedAt: workItems.archivedAt,
    })
    .from(workItems)
    .where(
      and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

function authorizedProjectUserScope(workspaceId: string) {
  return and(
    eq(memberships.workspaceId, workspaceId),
    or(
      inArray(memberships.role, ["owner", "admin"]),
      isNotNull(projectMemberships.userId),
    ),
  );
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function authorizedProjectUsersById(
  database: Executor,
  workspaceId: string,
  projectId: string,
  userIds: string[],
) {
  const uniqueIds = [...new Set(userIds)];
  const rows: Array<{ userId: string; name: string }> = [];
  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += COLLABORATION_BATCH_SIZE
  ) {
    const batch = uniqueIds.slice(offset, offset + COLLABORATION_BATCH_SIZE);
    const authorized = await database
      .select({ userId: memberships.userId, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projectMemberships.userId, memberships.userId),
        ),
      )
      .where(
        and(
          authorizedProjectUserScope(workspaceId),
          inArray(memberships.userId, batch),
        ),
      )
      .limit(batch.length);
    rows.push(...authorized);
  }
  return rows;
}

function mentionIds(body: string) {
  return [...body.matchAll(MENTION)].map((match) => match[2]!.toLowerCase());
}

async function validateMentions(
  database: Executor,
  workspaceId: string,
  projectId: string,
  body: string,
) {
  const ids = [...new Set(mentionIds(body))];
  const authorized = await authorizedProjectUsersById(
    database,
    workspaceId,
    projectId,
    ids,
  );
  if (authorized.length !== ids.length) {
    throw new PlatformError(
      "invalid_mention",
      400,
      "One or more mentions are not available in this project.",
    );
  }
  const names = new Map(
    authorized.map((member) => [member.userId, member.name]),
  );
  return {
    ids,
    body: body.replace(MENTION, (_token, _label: string, userId: string) => {
      const normalizedId = userId.toLowerCase();
      return `@[${names.get(normalizedId)!}](user:${normalizedId})`;
    }),
  };
}

async function createNotifications(
  transaction: Transaction,
  input: {
    workspaceId: string;
    projectId: string;
    actorUserId: string;
    workItemId?: string;
    commentId?: string;
    projectNoteId?: string;
    eventKey: string;
    recipients: Map<string, NotificationKind>;
    notifyWatchers?: boolean;
  },
) {
  input.recipients.delete(input.actorUserId);
  const directRecipientIds = new Set(input.recipients.keys());
  await insertAuthorizedNotifications(transaction, input, input.recipients);
  if (!input.notifyWatchers || !input.workItemId) return;

  let afterUserId: string | undefined;
  do {
    const watchers = await transaction
      .select({ userId: workItemSubscriptions.userId })
      .from(workItemSubscriptions)
      .where(
        and(
          eq(workItemSubscriptions.workItemId, input.workItemId),
          eq(workItemSubscriptions.state, "watching"),
          afterUserId
            ? gt(workItemSubscriptions.userId, afterUserId)
            : undefined,
        ),
      )
      .orderBy(asc(workItemSubscriptions.userId))
      .limit(COLLABORATION_BATCH_SIZE);
    const recipients = new Map<string, NotificationKind>();
    for (const watcher of watchers) {
      if (
        watcher.userId !== input.actorUserId &&
        !directRecipientIds.has(watcher.userId)
      ) {
        recipients.set(watcher.userId, "comment_added");
      }
    }
    await insertAuthorizedNotifications(transaction, input, recipients);
    afterUserId = watchers.at(-1)?.userId;
    if (watchers.length < COLLABORATION_BATCH_SIZE) break;
  } while (afterUserId);
}

async function insertAuthorizedNotifications(
  transaction: Transaction,
  input: {
    workspaceId: string;
    projectId: string;
    actorUserId: string;
    workItemId?: string;
    commentId?: string;
    projectNoteId?: string;
    eventKey: string;
  },
  recipients: Map<string, NotificationKind>,
) {
  if (!recipients.size) return;
  const authorized = await authorizedProjectUsersById(
    transaction,
    input.workspaceId,
    input.projectId,
    [...recipients.keys()],
  );
  const allowed = new Set(authorized.map((recipient) => recipient.userId));
  const values = [...recipients]
    .filter(([userId]) => allowed.has(userId))
    .map(([userId, kind]) => ({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId,
      kind,
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      workItemId: input.workItemId,
      commentId: input.commentId,
      projectNoteId: input.projectNoteId,
      dedupeKey: `${input.eventKey}:${kind}:${userId}`,
    }));
  for (
    let offset = 0;
    offset < values.length;
    offset += COLLABORATION_BATCH_SIZE
  ) {
    await transaction
      .insert(notifications)
      .values(values.slice(offset, offset + COLLABORATION_BATCH_SIZE))
      .onConflictDoNothing();
  }
}

export async function listMentionableMembers(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters?: { page: number; pageSize: number; query?: string },
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;
  const query = filters?.query?.trim();
  const where = and(
    authorizedProjectUserScope(workspaceId),
    query ? ilike(users.name, `%${escapeLike(query)}%`) : undefined,
  );
  const [rows, totals] = await Promise.all([
    getDb()
      .select({ userId: memberships.userId, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projectMemberships.userId, memberships.userId),
        ),
      )
      .where(where)
      .orderBy(asc(users.name), asc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb()
      .select({ total: count() })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projectMemberships.userId, memberships.userId),
        ),
      )
      .where(where),
  ]);
  return pageResult(rows, page, pageSize, totals[0]?.total ?? 0);
}

export async function listComments(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  page = 1,
  pageSize = 50,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  await getScopedWorkItem(getDb(), projectId, workItemId);
  const where = and(
    eq(workItemComments.projectId, projectId),
    eq(workItemComments.workItemId, workItemId),
  );
  const fields = {
    id: workItemComments.id,
    parentCommentId: workItemComments.parentCommentId,
    authorUserId: workItemComments.authorUserId,
    authorName: users.name,
    body: workItemComments.body,
    version: workItemComments.version,
    editedAt: workItemComments.editedAt,
    deletedAt: workItemComments.deletedAt,
    createdAt: workItemComments.createdAt,
    updatedAt: workItemComments.updatedAt,
  };
  const [pageRows, totals] = await Promise.all([
    getDb()
      .select(fields)
      .from(workItemComments)
      .innerJoin(users, eq(users.id, workItemComments.authorUserId))
      .where(where)
      .orderBy(desc(workItemComments.createdAt), desc(workItemComments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb().select({ total: count() }).from(workItemComments).where(where),
  ]);
  const pageIds = new Set(pageRows.map((comment) => comment.id));
  const missingParentIds = [
    ...new Set(
      pageRows
        .map((comment) => comment.parentCommentId)
        .filter(
          (parentId): parentId is string =>
            Boolean(parentId) && !pageIds.has(parentId!),
        ),
    ),
  ];
  const parentRows = missingParentIds.length
    ? await getDb()
        .select(fields)
        .from(workItemComments)
        .innerJoin(users, eq(users.id, workItemComments.authorUserId))
        .where(
          and(
            eq(workItemComments.projectId, projectId),
            eq(workItemComments.workItemId, workItemId),
            inArray(workItemComments.id, missingParentIds),
          ),
        )
        .limit(pageSize)
    : [];
  return pageResult(
    [
      ...pageRows.map((comment) => ({ ...comment, contextOnly: false })),
      ...parentRows.map((comment) => ({ ...comment, contextOnly: true })),
    ],
    page,
    pageSize,
    totals[0]?.total ?? 0,
  );
}

function storedCommentMatches(
  row: { body: string | null; parentCommentId: string | null } | undefined,
  body: string,
  parentCommentId: string | null,
) {
  return row?.body === body && row.parentCommentId === parentCommentId;
}

async function existingCommentId(
  transaction: Transaction,
  workItemId: string,
  requestId: string,
  body: string,
  parentCommentId: string | null,
) {
  const rows = await transaction
    .select({
      id: workItemComments.id,
      body: workItemComments.body,
      parentCommentId: workItemComments.parentCommentId,
    })
    .from(workItemComments)
    .where(
      and(
        eq(workItemComments.workItemId, workItemId),
        eq(workItemComments.requestId, requestId),
      ),
    )
    .for("update")
    .limit(1);
  if (!rows[0]) return null;
  if (storedCommentMatches(rows[0], body, parentCommentId)) return rows[0].id;
  throw conflict(
    "request_conflict",
    "That request identifier is already in use.",
  );
}

async function parentCommentAuthor(
  transaction: Transaction,
  projectId: string,
  workItemId: string,
  parentCommentId: string | null,
) {
  if (!parentCommentId) return null;
  const rows = await transaction
    .select({
      parentCommentId: workItemComments.parentCommentId,
      authorUserId: workItemComments.authorUserId,
    })
    .from(workItemComments)
    .where(
      and(
        eq(workItemComments.id, parentCommentId),
        eq(workItemComments.workItemId, workItemId),
        eq(workItemComments.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  if (rows[0].parentCommentId) {
    throw conflict("reply_depth", "Replies can only be one level deep.");
  }
  return rows[0].authorUserId;
}

async function insertCommentRecord(
  transaction: Transaction,
  input: {
    projectId: string;
    workItemId: string;
    parentCommentId: string | null;
    authorUserId: string;
    requestId: string;
    body: string;
  },
) {
  const commentId = randomUUID();
  const inserted = await transaction
    .insert(workItemComments)
    .values({ id: commentId, ...input })
    .onConflictDoNothing()
    .returning({ id: workItemComments.id });
  if (inserted[0]) return { id: commentId, created: true };
  const raced = await transaction
    .select({
      id: workItemComments.id,
      body: workItemComments.body,
      parentCommentId: workItemComments.parentCommentId,
    })
    .from(workItemComments)
    .where(
      and(
        eq(workItemComments.workItemId, input.workItemId),
        eq(workItemComments.requestId, input.requestId),
      ),
    )
    .limit(1);
  if (storedCommentMatches(raced[0], input.body, input.parentCommentId)) {
    return { id: raced[0]!.id, created: false };
  }
  throw conflict(
    "request_conflict",
    "That request identifier is already in use.",
  );
}

export async function createComment(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  input: CreateCommentInput,
) {
  const id = await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const workItem = await getScopedWorkItem(
      transaction,
      projectId,
      workItemId,
    );
    if (workItem.archivedAt) {
      throw conflict(
        "work_item_archived",
        "Restore the work item before commenting.",
      );
    }
    const mentionResult = await validateMentions(
      transaction,
      workspaceId,
      projectId,
      input.body,
    );
    const parentCommentId = input.parentCommentId ?? null;
    const existingId = await existingCommentId(
      transaction,
      workItemId,
      input.requestId,
      mentionResult.body,
      parentCommentId,
    );
    if (existingId) return existingId;
    const parentAuthorUserId = await parentCommentAuthor(
      transaction,
      projectId,
      workItemId,
      parentCommentId,
    );
    const inserted = await insertCommentRecord(transaction, {
      projectId,
      workItemId,
      parentCommentId,
      authorUserId: actor.userId,
      requestId: input.requestId,
      body: mentionResult.body,
    });
    if (!inserted.created) return inserted.id;
    const commentId = inserted.id;
    await transaction.insert(workItemCommentRevisions).values({
      commentId,
      editorUserId: actor.userId,
      version: 1,
      body: mentionResult.body,
    });
    if (mentionResult.ids.length) {
      await transaction
        .insert(workItemCommentMentions)
        .values(mentionResult.ids.map((userId) => ({ commentId, userId })));
    }
    await transaction
      .insert(workItemSubscriptions)
      .values({ workspaceId, projectId, workItemId, userId: actor.userId })
      .onConflictDoNothing();

    const recipients = new Map<string, NotificationKind>();
    const assigneeSubscription = workItem.assigneeUserId
      ? await transaction
          .select({ state: workItemSubscriptions.state })
          .from(workItemSubscriptions)
          .where(
            and(
              eq(workItemSubscriptions.workItemId, workItemId),
              eq(workItemSubscriptions.userId, workItem.assigneeUserId),
            ),
          )
          .limit(1)
      : [];
    const assigneeMuted = assigneeSubscription[0]?.state === "muted";
    if (workItem.assigneeUserId && !assigneeMuted)
      recipients.set(workItem.assigneeUserId, "comment_added");
    if (parentAuthorUserId) recipients.set(parentAuthorUserId, "comment_reply");
    for (const userId of mentionResult.ids) recipients.set(userId, "mention");
    await createNotifications(transaction, {
      workspaceId,
      projectId,
      actorUserId: actor.userId,
      workItemId,
      commentId,
      eventKey: `comment:${commentId}:v1`,
      recipients,
      notifyWatchers: true,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.comment.created.v1",
      targetType: "work_item_comment",
      targetId: commentId,
      metadata: { projectId, workItemId },
    });
    return commentId;
  });
  return getComment(actor, workspaceId, projectId, workItemId, id);
}

export async function getComment(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  commentId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: workItemComments.id,
      parentCommentId: workItemComments.parentCommentId,
      authorUserId: workItemComments.authorUserId,
      authorName: users.name,
      body: workItemComments.body,
      version: workItemComments.version,
      editedAt: workItemComments.editedAt,
      deletedAt: workItemComments.deletedAt,
      createdAt: workItemComments.createdAt,
      updatedAt: workItemComments.updatedAt,
    })
    .from(workItemComments)
    .innerJoin(users, eq(users.id, workItemComments.authorUserId))
    .where(
      and(
        eq(workItemComments.id, commentId),
        eq(workItemComments.workItemId, workItemId),
        eq(workItemComments.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function updateComment(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  commentId: string,
  input: UpdateCommentInput,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const current = await transaction
      .select()
      .from(workItemComments)
      .where(
        and(
          eq(workItemComments.id, commentId),
          eq(workItemComments.workItemId, workItemId),
          eq(workItemComments.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!current[0]) throw notFound();
    if (current[0].authorUserId !== actor.userId) throw forbidden();
    if (current[0].deletedAt) {
      throw conflict("comment_deleted", "Deleted comments cannot be edited.");
    }
    const mentionResult = await validateMentions(
      transaction,
      workspaceId,
      projectId,
      input.body,
    );
    if (mentionResult.body === current[0].body) return;
    const nextVersion = current[0].version + 1;
    await transaction.insert(workItemCommentRevisions).values({
      commentId,
      editorUserId: actor.userId,
      version: nextVersion,
      body: mentionResult.body,
    });
    await transaction
      .update(workItemComments)
      .set({
        body: mentionResult.body,
        version: nextVersion,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workItemComments.id, commentId));
    await transaction
      .delete(workItemCommentMentions)
      .where(eq(workItemCommentMentions.commentId, commentId));
    if (mentionResult.ids.length) {
      await transaction
        .insert(workItemCommentMentions)
        .values(mentionResult.ids.map((userId) => ({ commentId, userId })));
    }
    await createNotifications(transaction, {
      workspaceId,
      projectId,
      actorUserId: actor.userId,
      workItemId,
      commentId,
      eventKey: `comment:${commentId}:v${nextVersion}`,
      recipients: new Map(
        mentionResult.ids.map((userId) => [userId, "mention"]),
      ),
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.comment.updated.v1",
      targetType: "work_item_comment",
      targetId: commentId,
      metadata: { changedFields: ["body"], projectId, workItemId },
    });
  });
  return getComment(actor, workspaceId, projectId, workItemId, commentId);
}

export async function deleteComment(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  commentId: string,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const current = await transaction
      .select({
        authorUserId: workItemComments.authorUserId,
        deletedAt: workItemComments.deletedAt,
      })
      .from(workItemComments)
      .where(
        and(
          eq(workItemComments.id, commentId),
          eq(workItemComments.workItemId, workItemId),
          eq(workItemComments.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!current[0]) throw notFound();
    if (current[0].authorUserId !== actor.userId) throw forbidden();
    if (!current[0].deletedAt) {
      await transaction
        .update(workItemComments)
        .set({ body: null, deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(workItemComments.id, commentId));
      await transaction
        .delete(workItemCommentMentions)
        .where(eq(workItemCommentMentions.commentId, commentId));
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "work_item.comment.deleted.v1",
        targetType: "work_item_comment",
        targetId: commentId,
        metadata: { projectId, workItemId },
      });
    }
  });
  return { id: commentId, deleted: true };
}

export async function listCommentHistory(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  commentId: string,
) {
  await getComment(actor, workspaceId, projectId, workItemId, commentId);
  const rows = await getDb()
    .select({
      id: workItemCommentRevisions.id,
      version: workItemCommentRevisions.version,
      body: workItemCommentRevisions.body,
      editorUserId: workItemCommentRevisions.editorUserId,
      editorName: users.name,
      createdAt: workItemCommentRevisions.createdAt,
    })
    .from(workItemCommentRevisions)
    .innerJoin(users, eq(users.id, workItemCommentRevisions.editorUserId))
    .where(eq(workItemCommentRevisions.commentId, commentId))
    .orderBy(desc(workItemCommentRevisions.version))
    .limit(100);
  return { data: rows };
}

export async function getSubscription(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  await getScopedWorkItem(getDb(), projectId, workItemId);
  const rows = await getDb()
    .select({
      state: workItemSubscriptions.state,
      source: workItemSubscriptions.source,
    })
    .from(workItemSubscriptions)
    .where(
      and(
        eq(workItemSubscriptions.workItemId, workItemId),
        eq(workItemSubscriptions.userId, actor.userId),
      ),
    )
    .limit(1);
  return {
    watching: rows[0]?.state === "watching",
    source: rows[0]?.source ?? null,
  };
}

export async function updateSubscription(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  watching: boolean,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  await getScopedWorkItem(getDb(), projectId, workItemId);
  await getDb()
    .insert(workItemSubscriptions)
    .values({
      workspaceId,
      projectId,
      workItemId,
      userId: actor.userId,
      state: watching ? "watching" : "muted",
      source: "explicit",
    })
    .onConflictDoUpdate({
      target: [workItemSubscriptions.workItemId, workItemSubscriptions.userId],
      set: {
        state: watching ? "watching" : "muted",
        source: "explicit",
        updatedAt: new Date(),
      },
    });
  return { watching, source: "explicit" as const };
}

export async function listProjectNotes(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: ProjectNoteFilters,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const where = and(
    eq(projectNotes.projectId, projectId),
    filters.archived
      ? isNotNull(projectNotes.archivedAt)
      : isNull(projectNotes.archivedAt),
  );
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: projectNotes.id,
        title: projectNotes.title,
        body: projectNotes.body,
        authorUserId: projectNotes.authorUserId,
        authorName: users.name,
        editedAt: projectNotes.editedAt,
        archivedAt: projectNotes.archivedAt,
        createdAt: projectNotes.createdAt,
        updatedAt: projectNotes.updatedAt,
      })
      .from(projectNotes)
      .innerJoin(users, eq(users.id, projectNotes.authorUserId))
      .where(where)
      .orderBy(desc(projectNotes.updatedAt), desc(projectNotes.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb().select({ total: count() }).from(projectNotes).where(where),
  ]);
  return pageResult(
    rows,
    filters.page,
    filters.pageSize,
    totals[0]?.total ?? 0,
  );
}

export async function createProjectNote(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateProjectNoteInput,
) {
  const noteId = await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    await transaction.execute(
      sql`select 1 from ${projects} where ${projects.id} = ${projectId} for update`,
    );
    const mentionResult = await validateMentions(
      transaction,
      workspaceId,
      projectId,
      input.body,
    );
    const existing = await transaction
      .select({
        id: projectNotes.id,
        title: projectNotes.title,
        body: projectNotes.body,
      })
      .from(projectNotes)
      .where(
        and(
          eq(projectNotes.projectId, projectId),
          eq(projectNotes.requestId, input.requestId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (
        existing[0].title === input.title &&
        existing[0].body === mentionResult.body
      )
        return existing[0].id;
      throw conflict(
        "request_conflict",
        "That request identifier is already in use.",
      );
    }
    const totals = await transaction
      .select({ total: count() })
      .from(projectNotes)
      .where(
        and(
          eq(projectNotes.projectId, projectId),
          isNull(projectNotes.archivedAt),
        ),
      );
    if ((totals[0]?.total ?? 0) >= MAX_ACTIVE_PROJECT_NOTES) {
      throw conflict(
        "project_note_limit",
        "Archive a project note before creating another.",
      );
    }
    const id = randomUUID();
    await transaction.insert(projectNotes).values({
      id,
      projectId,
      authorUserId: actor.userId,
      requestId: input.requestId,
      title: input.title,
      body: mentionResult.body,
    });
    if (mentionResult.ids.length) {
      await transaction
        .insert(projectNoteMentions)
        .values(mentionResult.ids.map((userId) => ({ noteId: id, userId })));
    }
    await createNotifications(transaction, {
      workspaceId,
      projectId,
      actorUserId: actor.userId,
      projectNoteId: id,
      eventKey: `project-note:${id}:v1`,
      recipients: new Map(
        mentionResult.ids.map((userId) => [userId, "mention"]),
      ),
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "project.note.created.v1",
      targetType: "project_note",
      targetId: id,
      metadata: { projectId },
    });
    return id;
  });
  return getProjectNote(actor, workspaceId, projectId, noteId);
}

export async function getProjectNote(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  noteId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: projectNotes.id,
      title: projectNotes.title,
      body: projectNotes.body,
      authorUserId: projectNotes.authorUserId,
      authorName: users.name,
      editedAt: projectNotes.editedAt,
      archivedAt: projectNotes.archivedAt,
      createdAt: projectNotes.createdAt,
      updatedAt: projectNotes.updatedAt,
    })
    .from(projectNotes)
    .innerJoin(users, eq(users.id, projectNotes.authorUserId))
    .where(
      and(eq(projectNotes.id, noteId), eq(projectNotes.projectId, projectId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function updateProjectNote(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  noteId: string,
  input: UpdateProjectNoteInput,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const current = await transaction
      .select()
      .from(projectNotes)
      .where(
        and(eq(projectNotes.id, noteId), eq(projectNotes.projectId, projectId)),
      )
      .for("update")
      .limit(1);
    if (!current[0]) throw notFound();
    const mentionResult =
      input.body === undefined
        ? null
        : await validateMentions(
            transaction,
            workspaceId,
            projectId,
            input.body,
          );
    const titleChanged =
      input.title !== undefined && input.title !== current[0].title;
    const bodyChanged =
      mentionResult !== null && mentionResult.body !== current[0].body;
    const archiveChanged =
      input.archived !== undefined &&
      input.archived !== Boolean(current[0].archivedAt);
    if (!titleChanged && !bodyChanged && !archiveChanged) return;
    await assertProjectNoteRestoreCapacity(
      transaction,
      projectId,
      archiveChanged &&
        input.archived === false &&
        Boolean(current[0].archivedAt),
    );
    await transaction
      .update(projectNotes)
      .set({
        ...(titleChanged ? { title: input.title } : {}),
        ...(bodyChanged ? { body: mentionResult!.body } : {}),
        ...(!archiveChanged
          ? {}
          : { archivedAt: input.archived ? new Date() : null }),
        ...(titleChanged || bodyChanged ? { editedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projectNotes.id, noteId));
    await syncProjectNoteMentions(transaction, {
      workspaceId,
      projectId,
      noteId,
      actorUserId: actor.userId,
      previousUpdatedAt: current[0].updatedAt,
      mentionResult: bodyChanged ? mentionResult : null,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: projectNoteEventType(input.archived),
      targetType: "project_note",
      targetId: noteId,
      metadata: {
        changedFields: projectNoteChangedFields(
          titleChanged,
          bodyChanged,
          archiveChanged,
        ),
        projectId,
      },
    });
  });
  return getProjectNote(actor, workspaceId, projectId, noteId);
}

async function assertProjectNoteRestoreCapacity(
  transaction: Transaction,
  projectId: string,
  restoring: boolean,
) {
  if (!restoring) return;
  await transaction.execute(
    sql`select 1 from ${projects} where ${projects.id} = ${projectId} for update`,
  );
  const totals = await transaction
    .select({ total: count() })
    .from(projectNotes)
    .where(
      and(
        eq(projectNotes.projectId, projectId),
        isNull(projectNotes.archivedAt),
      ),
    );
  if ((totals[0]?.total ?? 0) >= MAX_ACTIVE_PROJECT_NOTES) {
    throw conflict(
      "project_note_limit",
      "Archive a project note before restoring another.",
    );
  }
}

async function syncProjectNoteMentions(
  transaction: Transaction,
  input: {
    workspaceId: string;
    projectId: string;
    noteId: string;
    actorUserId: string;
    previousUpdatedAt: Date;
    mentionResult: { ids: string[]; body: string } | null;
  },
) {
  if (!input.mentionResult) return;
  await transaction
    .delete(projectNoteMentions)
    .where(eq(projectNoteMentions.noteId, input.noteId));
  if (input.mentionResult.ids.length) {
    await transaction.insert(projectNoteMentions).values(
      input.mentionResult.ids.map((userId) => ({
        noteId: input.noteId,
        userId,
      })),
    );
  }
  await createNotifications(transaction, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    projectNoteId: input.noteId,
    eventKey: `project-note:${input.noteId}:${input.previousUpdatedAt.toISOString()}`,
    recipients: new Map(
      input.mentionResult.ids.map((userId) => [userId, "mention"]),
    ),
  });
}

function projectNoteEventType(archived: boolean | undefined) {
  if (archived === true) return "project.note.archived.v1";
  if (archived === false) return "project.note.restored.v1";
  return "project.note.updated.v1";
}

function projectNoteChangedFields(
  titleChanged: boolean,
  bodyChanged: boolean,
  archiveChanged: boolean,
) {
  const fields: string[] = [];
  if (titleChanged) fields.push("title");
  if (bodyChanged) fields.push("body");
  if (archiveChanged) fields.push("archived");
  return fields;
}

export async function listNotifications(
  actor: UserActor,
  workspaceId: string,
  filters: NotificationFilters,
) {
  const role = await getWorkspaceRole(getDb(), actor, workspaceId);
  const accessible =
    role === "member"
      ? sql`exists (select 1 from ${projectMemberships} pm where pm.project_id = ${notifications.projectId} and pm.user_id = ${actor.userId})`
      : sql`true`;
  const where = and(
    eq(notifications.workspaceId, workspaceId),
    eq(notifications.userId, actor.userId),
    accessible,
    filters.unread === undefined
      ? undefined
      : filters.unread
        ? isNull(notifications.readAt)
        : isNotNull(notifications.readAt),
  );
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: notifications.id,
        kind: notifications.kind,
        actorUserId: notifications.actorUserId,
        actorName: users.name,
        projectId: notifications.projectId,
        projectKey: projects.key,
        workItemId: notifications.workItemId,
        workItemNumber: workItems.number,
        commentId: notifications.commentId,
        projectNoteId: notifications.projectNoteId,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .innerJoin(projects, eq(projects.id, notifications.projectId))
      .leftJoin(users, eq(users.id, notifications.actorUserId))
      .leftJoin(workItems, eq(workItems.id, notifications.workItemId))
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb().select({ total: count() }).from(notifications).where(where),
  ]);
  return pageResult(
    rows,
    filters.page,
    filters.pageSize,
    totals[0]?.total ?? 0,
  );
}

export async function updateNotifications(
  actor: UserActor,
  workspaceId: string,
  ids: string[],
  read: boolean,
) {
  const role = await getWorkspaceRole(getDb(), actor, workspaceId);
  const accessible =
    role === "member"
      ? sql`exists (select 1 from ${projectMemberships} pm where pm.project_id = ${notifications.projectId} and pm.user_id = ${actor.userId})`
      : sql`true`;
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, actor.userId),
        accessible,
        inArray(notifications.id, ids),
      ),
    )
    .returning({ id: notifications.id, readAt: notifications.readAt });
  return { data: rows };
}

const ACTIVITY_LABELS: Record<string, string> = {
  "work_item.created.v1": "created the work item",
  "work_item.updated.v1": "updated the work item",
  "work_item.status.updated.v1": "changed the status",
  "work_item.assignee.updated.v1": "changed the assignee",
  "work_item.milestone.updated.v1": "changed the milestone",
  "work_item.cycle.updated.v1": "changed the cycle",
  "work_item.archived.v1": "archived the work item",
  "work_item.restored.v1": "restored the work item",
  "work_item.comment.created.v1": "commented",
  "work_item.comment.updated.v1": "edited a comment",
  "work_item.comment.deleted.v1": "deleted a comment",
  "project.note.created.v1": "created a project note",
  "project.note.updated.v1": "updated a project note",
  "project.note.archived.v1": "archived a project note",
  "project.note.restored.v1": "restored a project note",
  "project.updated.v1": "updated the project",
  "project.lifecycle.updated.v1": "changed the project lifecycle",
  "project.membership.added.v1": "added a project member",
  "project.membership.removed.v1": "removed a project member",
  "milestone.created.v1": "created a milestone",
  "milestone.updated.v1": "updated a milestone",
  "cycle.created.v1": "created a cycle",
  "cycle.updated.v1": "updated a cycle",
  "commercial.source.created.v1": "added commercial evidence",
  "commercial.source.parsing.retried.v1": "retried commercial evidence parsing",
  "commercial.baseline.created.v1": "created the commercial baseline",
  "commercial.scope_item.created.v1": "added baseline scope",
  "commercial.scope_item.revised.v1": "revised baseline scope",
  "commercial.scope_item.archived.v1": "archived baseline scope",
  "commercial.scope_item.restored.v1": "restored baseline scope",
  "work_item.purpose.updated.v1": "classified the work item",
  "work_item.commercial_basis.linked.v1": "linked commercial basis",
  "work_item.commercial_basis.unlinked.v1": "removed commercial basis",
  "ai_job.created.v1": "started an AI delivery analysis",
  "ai_job.succeeded.v1": "generated an evidence-grounded AI result",
  "ai_action.confirmed.v1": "confirmed AI-generated draft records",
  "ai_work_candidate.created.v1": "generated draft backlog work",
  "ai_clarification_candidate.created.v1":
    "generated an internal clarification draft",
  "commercial_clarification.resolved.v1": "resolved an AI clarification draft",
  "commercial_clarification.dismissed.v1":
    "dismissed an AI clarification draft",
};

export async function listActivity(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: ActivityFilters,
  workItemId?: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  if (workItemId) await getScopedWorkItem(getDb(), projectId, workItemId);
  const eventTypes = Object.keys(ACTIVITY_LABELS);
  const targetScope = workItemId
    ? or(
        and(
          eq(auditEvents.targetType, "work_item"),
          eq(auditEvents.targetId, workItemId),
        ),
        sql`${auditEvents.metadata}->>'workItemId' = ${workItemId}`,
      )
    : or(
        and(
          eq(auditEvents.targetType, "project"),
          eq(auditEvents.targetId, projectId),
        ),
        sql`${auditEvents.metadata}->>'projectId' = ${projectId}`,
      );
  const where = and(
    eq(auditEvents.workspaceId, workspaceId),
    inArray(auditEvents.eventType, eventTypes),
    targetScope,
  );
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        actorType: auditEvents.actorType,
        actorId: auditEvents.actorId,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb().select({ total: count() }).from(auditEvents).where(where),
  ]);
  const actorIds = [
    ...new Set(rows.map((row) => row.actorId).filter(Boolean) as string[]),
  ];
  const actors = actorIds.length
    ? await getDb()
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const names = new Map(actors.map((item) => [item.id, item.name]));
  return pageResult(
    rows.map((row) => ({
      ...row,
      actorName:
        row.actorType === "ai_agent"
          ? "AI agent"
          : row.actorId
            ? (names.get(row.actorId) ?? "Former member")
            : "System",
      description: ACTIVITY_LABELS[row.eventType] ?? "updated the project",
    })),
    filters.page,
    filters.pageSize,
    totals[0]?.total ?? 0,
  );
}
