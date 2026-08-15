import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  commercialRequestClarifications,
  commercialRequests,
} from "@/db/schema";
import { updateClarificationSchema } from "@/lib/ai/contracts";
import { notFound, PlatformError } from "@/lib/platform-errors";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";
import { randomUUID } from "node:crypto";

async function assertRequest(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({ id: commercialRequests.id })
    .from(commercialRequests)
    .where(
      and(
        eq(commercialRequests.id, requestId),
        eq(commercialRequests.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
}

export async function listRequestClarifications(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
) {
  await assertRequest(actor, workspaceId, projectId, requestId);
  return getDb()
    .select()
    .from(commercialRequestClarifications)
    .where(
      and(
        eq(commercialRequestClarifications.projectId, projectId),
        eq(commercialRequestClarifications.requestId, requestId),
      ),
    )
    .orderBy(
      asc(commercialRequestClarifications.status),
      asc(commercialRequestClarifications.createdAt),
    );
}

export async function updateRequestClarification(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  clarificationId: string,
  rawInput: unknown,
) {
  const input = updateClarificationSchema.parse(rawInput);
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  assertProjectManager(access, actor.userId);
  const now = new Date();
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const updated = await transaction
      .update(commercialRequestClarifications)
      .set({
        status: input.status,
        resolvedByUserId: actor.userId,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(commercialRequestClarifications.id, clarificationId),
          eq(commercialRequestClarifications.projectId, projectId),
          eq(commercialRequestClarifications.requestId, requestId),
          eq(commercialRequestClarifications.status, "draft"),
        ),
      )
      .returning({ id: commercialRequestClarifications.id });
    if (!updated[0]) {
      throw new PlatformError(
        "clarification_not_draft",
        409,
        "Only draft clarification questions can be changed.",
      );
    }
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: `commercial_clarification.${input.status}.v1`,
      targetType: "clarification",
      targetId: clarificationId,
      metadata: { projectId, requestId },
    });
  });
  const rows = await getDb()
    .select()
    .from(commercialRequestClarifications)
    .where(eq(commercialRequestClarifications.id, clarificationId))
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}
