import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { and, asc, desc, eq, gt, isNotNull, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  clientCollaborationNotifications,
  clientProjectParticipants,
  memberships,
  notifications,
  projectMemberships,
  projects,
  workspaces,
} from "@/db/schema";
import { PlatformError } from "@/lib/platform-errors";
import { getAuthSecret } from "@/lib/env";
import type { UserActor } from "@/server/workspaces";

const DESKTOP_PROTOCOL_VERSION = 1;
const uuidSchema = z.string().uuid();
const watermarkSchema = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    id: uuidSchema,
  })
  .strict();
const cursorSchema = z
  .object({
    version: z.literal(DESKTOP_PROTOCOL_VERSION),
    sources: z
      .object({
        workspace: watermarkSchema.nullable(),
        clientInternal: watermarkSchema.nullable(),
        clientPortal: watermarkSchema.nullable(),
      })
      .strict(),
  })
  .strict();

type SourceName = "workspace" | "clientInternal" | "clientPortal";
type Watermark = z.infer<typeof watermarkSchema>;
type DesktopCursor = z.infer<typeof cursorSchema>;

export type DesktopNotificationCategory =
  "work_item_activity" | "client_activity";

export type DesktopNotificationEvent = {
  id: string;
  category: DesktopNotificationCategory;
  createdAt: string;
  path: string;
};

type Candidate = DesktopNotificationEvent & {
  source: SourceName;
  sourceId: string;
};

const emptyCursor = (): DesktopCursor => ({
  version: DESKTOP_PROTOCOL_VERSION,
  sources: {
    workspace: null,
    clientInternal: null,
    clientPortal: null,
  },
});

const invalidCursor = () =>
  new PlatformError(
    "invalid_desktop_cursor",
    400,
    "The desktop cursor is invalid.",
  );

export function encodeDesktopNotificationCursor(cursor: DesktopCursor) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", desktopCursorKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(cursor), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}

export function decodeDesktopNotificationCursor(value: string) {
  if (!value || value.length > 2048) throw invalidCursor();
  try {
    const sealed = Buffer.from(value, "base64url");
    if (sealed.length < 29) throw invalidCursor();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      desktopCursorKey(),
      sealed.subarray(0, 12),
    );
    decipher.setAuthTag(sealed.subarray(12, 28));
    return cursorSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(sealed.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      ),
    );
  } catch {
    throw invalidCursor();
  }
}

function desktopCursorKey() {
  return createHash("sha256")
    .update("scopedelta:desktop-notification-cursor:v1\0")
    .update(getAuthSecret())
    .digest();
}

function afterWatermark<TCreatedAt, TId>(
  createdAt: TCreatedAt,
  id: TId,
  watermark: Watermark | null,
) {
  if (!watermark) return undefined;
  const timestamp = new Date(watermark.createdAt);
  return or(
    gt(createdAt as never, timestamp),
    and(eq(createdAt as never, timestamp), gt(id as never, watermark.id)),
  );
}

function accessibleProject(
  role: typeof memberships.role,
  projectId: typeof projects.id,
) {
  return or(
    ne(role, "member"),
    isNotNull(projectMemberships.projectId),
    eq(projectId, projectMemberships.projectId),
  );
}

async function workspaceCandidates(
  actor: UserActor,
  watermark: Watermark | null,
  limit: number,
  latest = false,
): Promise<Candidate[]> {
  const rows = await getDb()
    .select({
      id: notifications.id,
      createdAt: notifications.createdAt,
      workspaceSlug: workspaces.slug,
      projectKey: projects.key,
      workItemId: notifications.workItemId,
    })
    .from(notifications)
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, notifications.workspaceId),
        eq(memberships.userId, actor.userId),
        eq(memberships.status, "active"),
      ),
    )
    .innerJoin(projects, eq(projects.id, notifications.projectId))
    .innerJoin(workspaces, eq(workspaces.id, notifications.workspaceId))
    .leftJoin(
      projectMemberships,
      and(
        eq(projectMemberships.projectId, notifications.projectId),
        eq(projectMemberships.userId, actor.userId),
      ),
    )
    .where(
      and(
        eq(notifications.userId, actor.userId),
        accessibleProject(memberships.role, projects.id),
        afterWatermark(notifications.createdAt, notifications.id, watermark),
      ),
    )
    .orderBy(
      latest ? desc(notifications.createdAt) : asc(notifications.createdAt),
      latest ? desc(notifications.id) : asc(notifications.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    id: `workspace:${row.id}`,
    source: "workspace",
    sourceId: row.id,
    category: "work_item_activity",
    createdAt: row.createdAt.toISOString(),
    path: row.workItemId
      ? `/app/${encodeURIComponent(row.workspaceSlug)}/projects/${encodeURIComponent(row.projectKey)}/work/${row.workItemId}`
      : `/app/${encodeURIComponent(row.workspaceSlug)}/projects/${encodeURIComponent(row.projectKey)}`,
  }));
}

async function internalClientCandidates(
  actor: UserActor,
  watermark: Watermark | null,
  limit: number,
  latest = false,
): Promise<Candidate[]> {
  const rows = await getDb()
    .select({
      id: clientCollaborationNotifications.id,
      createdAt: clientCollaborationNotifications.createdAt,
      workspaceSlug: workspaces.slug,
      projectKey: projects.key,
    })
    .from(clientCollaborationNotifications)
    .innerJoin(
      memberships,
      and(
        eq(
          memberships.workspaceId,
          clientCollaborationNotifications.workspaceId,
        ),
        eq(memberships.userId, actor.userId),
        eq(memberships.status, "active"),
      ),
    )
    .innerJoin(
      projects,
      eq(projects.id, clientCollaborationNotifications.projectId),
    )
    .innerJoin(
      workspaces,
      eq(workspaces.id, clientCollaborationNotifications.workspaceId),
    )
    .leftJoin(
      projectMemberships,
      and(
        eq(
          projectMemberships.projectId,
          clientCollaborationNotifications.projectId,
        ),
        eq(projectMemberships.userId, actor.userId),
      ),
    )
    .where(
      and(
        eq(clientCollaborationNotifications.recipientUserId, actor.userId),
        isNull(clientCollaborationNotifications.recipientParticipantId),
        accessibleProject(memberships.role, projects.id),
        afterWatermark(
          clientCollaborationNotifications.createdAt,
          clientCollaborationNotifications.id,
          watermark,
        ),
      ),
    )
    .orderBy(
      latest
        ? desc(clientCollaborationNotifications.createdAt)
        : asc(clientCollaborationNotifications.createdAt),
      latest
        ? desc(clientCollaborationNotifications.id)
        : asc(clientCollaborationNotifications.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    id: `client-internal:${row.id}`,
    source: "clientInternal",
    sourceId: row.id,
    category: "client_activity",
    createdAt: row.createdAt.toISOString(),
    path: `/app/${encodeURIComponent(row.workspaceSlug)}/projects/${encodeURIComponent(row.projectKey)}/client`,
  }));
}

async function clientPortalCandidates(
  actor: UserActor,
  watermark: Watermark | null,
  limit: number,
  latest = false,
): Promise<Candidate[]> {
  const rows = await getDb()
    .select({
      id: clientCollaborationNotifications.id,
      createdAt: clientCollaborationNotifications.createdAt,
      projectId: clientCollaborationNotifications.projectId,
    })
    .from(clientCollaborationNotifications)
    .innerJoin(
      clientProjectParticipants,
      and(
        eq(
          clientProjectParticipants.id,
          clientCollaborationNotifications.recipientParticipantId,
        ),
        eq(clientProjectParticipants.userId, actor.userId),
        eq(
          clientProjectParticipants.projectId,
          clientCollaborationNotifications.projectId,
        ),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .where(
      and(
        eq(clientCollaborationNotifications.recipientUserId, actor.userId),
        isNotNull(clientCollaborationNotifications.recipientParticipantId),
        afterWatermark(
          clientCollaborationNotifications.createdAt,
          clientCollaborationNotifications.id,
          watermark,
        ),
      ),
    )
    .orderBy(
      latest
        ? desc(clientCollaborationNotifications.createdAt)
        : asc(clientCollaborationNotifications.createdAt),
      latest
        ? desc(clientCollaborationNotifications.id)
        : asc(clientCollaborationNotifications.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    id: `client-portal:${row.id}`,
    source: "clientPortal",
    sourceId: row.id,
    category: "client_activity",
    createdAt: row.createdAt.toISOString(),
    path: `/client/projects/${row.projectId}`,
  }));
}

function watermarkFor(candidate: Candidate): Watermark {
  return { createdAt: candidate.createdAt, id: candidate.sourceId };
}

export async function listDesktopNotifications(
  actor: UserActor,
  encodedCursor: string | undefined,
  limit: number,
) {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  if (!encodedCursor) {
    const latest = await Promise.all([
      workspaceCandidates(actor, null, 1, true),
      internalClientCandidates(actor, null, 1, true),
      clientPortalCandidates(actor, null, 1, true),
    ]);
    const cursor = emptyCursor();
    latest.flat().forEach((candidate) => {
      cursor.sources[candidate.source] = watermarkFor(candidate);
    });
    return {
      events: [] as DesktopNotificationEvent[],
      cursor: encodeDesktopNotificationCursor(cursor),
      hasMore: false,
    };
  }

  const cursor = decodeDesktopNotificationCursor(encodedCursor);
  const candidateLimit = boundedLimit + 1;
  const candidates = (
    await Promise.all([
      workspaceCandidates(actor, cursor.sources.workspace, candidateLimit),
      internalClientCandidates(
        actor,
        cursor.sources.clientInternal,
        candidateLimit,
      ),
      clientPortalCandidates(
        actor,
        cursor.sources.clientPortal,
        candidateLimit,
      ),
    ])
  )
    .flat()
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  const selected = candidates.slice(0, boundedLimit);
  selected.forEach((candidate) => {
    cursor.sources[candidate.source] = watermarkFor(candidate);
  });

  return {
    events: selected.map((candidate) => ({
      id: candidate.id,
      category: candidate.category,
      createdAt: candidate.createdAt,
      path: candidate.path,
    })),
    cursor: encodeDesktopNotificationCursor(cursor),
    hasMore: candidates.length > boundedLimit,
  };
}
