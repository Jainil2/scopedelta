import { randomUUID } from "node:crypto";

import { notifications, workItemSubscriptions } from "@/db/schema";
import type { Transaction } from "@/server/delivery";

export async function recordWorkItemAssignment(
  transaction: Transaction,
  input: {
    workspaceId: string;
    projectId: string;
    workItemId: string;
    assigneeUserId: string;
    actorUserId: string;
    eventId: string;
  },
) {
  await transaction
    .insert(workItemSubscriptions)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      workItemId: input.workItemId,
      userId: input.assigneeUserId,
      state: "watching",
      source: "automatic",
    })
    .onConflictDoNothing();

  if (input.assigneeUserId === input.actorUserId) return;
  await transaction
    .insert(notifications)
    .values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.assigneeUserId,
      kind: "work_item_assigned",
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      workItemId: input.workItemId,
      dedupeKey: `assignment:${input.eventId}:${input.assigneeUserId}`,
    })
    .onConflictDoNothing();
}
