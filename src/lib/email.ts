import { after } from "next/server";
import nodemailer from "nodemailer";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  clientCollaborationNotifications,
  clientProjectInvitations,
  clientProjectParticipants,
  projects,
  users,
  workspaceInvitations,
} from "@/db/schema";
import { getAppUrl, getSmtpConfig } from "@/lib/env";
import { consumeManagedEmailUsage } from "@/server/billing";
import { recordWorkspaceProductSignal } from "@/server/self-service";
import { recordWorkspaceInvitationEmailResult } from "@/server/workspaces";

type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function getTransporter() {
  const config = getSmtpConfig();
  transporter ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user && config.password
        ? { user: config.user, pass: config.password }
        : undefined,
    connectionTimeout: 8_000,
    socketTimeout: 8_000,
  });
  return { transporter, from: config.from };
}

async function deliver(mail: Mail) {
  const transport = getTransporter();
  await transport.transporter.sendMail({ ...mail, from: transport.from });
}

export function scheduleEmail(mail: Mail) {
  after(async () => {
    try {
      await deliver(mail);
    } catch {
      // Do not log the destination, message, provider response, or token URL.
      console.error("platform_email_delivery_failed");
    }
  });
}

export function scheduleVerificationEmail(to: string, url: string) {
  const safeUrl = escapeHtml(url);
  scheduleEmail({
    to,
    subject: "Verify your ScopeDelta account",
    text: `Verify your ScopeDelta account: ${url}\n\nThis link expires in one hour.`,
    html: `<p>Verify your ScopeDelta account.</p><p><a href="${safeUrl}">Verify email</a></p><p>This link expires in one hour.</p>`,
  });
}

export function schedulePasswordResetEmail(to: string, url: string) {
  const safeUrl = escapeHtml(url);
  scheduleEmail({
    to,
    subject: "Reset your ScopeDelta password",
    text: `Reset your ScopeDelta password: ${url}\n\nThis link expires in one hour. If you did not request this, you can ignore it.`,
    html: `<p>Reset your ScopeDelta password.</p><p><a href="${safeUrl}">Reset password</a></p><p>This link expires in one hour. If you did not request this, you can ignore it.</p>`,
  });
}

export function scheduleWorkspaceInvitationEmail(
  to: string,
  workspaceName: string,
  token: string,
  invitationId?: string,
  workspaceId?: string,
) {
  const url = workspaceInvitationUrl(token);
  const safeUrl = escapeHtml(url);
  const mail = {
    to,
    subject: `Join ${workspaceName} in ScopeDelta`,
    text: `You have been invited to join a ScopeDelta workspace: ${url}\n\nThis link expires in seven days.`,
    html: `<p>You have been invited to join <strong>${escapeHtml(workspaceName)}</strong> in ScopeDelta.</p><p><a href="${safeUrl}">Accept invitation</a></p><p>This link expires in seven days.</p>`,
  };
  if (!invitationId || !workspaceId) {
    scheduleEmail(mail);
    return;
  }
  after(async () => {
    try {
      const current = await getDb()
        .select({ attempts: workspaceInvitations.emailAttemptCount })
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, invitationId))
        .limit(1);
      if (!current[0]) return;
      await consumeManagedEmailUsage({
        workspaceId,
        sourceType: "workspace_invitation",
        sourceId: invitationId,
        attemptNumber: current[0].attempts + 1,
      });
      await deliver(mail);
      await recordWorkspaceInvitationEmailResult(invitationId, "sent");
      await recordEmailSignal(
        workspaceId,
        invitationId,
        "succeeded",
        "workspace_invitation",
      );
    } catch {
      await recordWorkspaceInvitationEmailResult(
        invitationId,
        "failed",
        "delivery_failed",
      );
      await recordEmailSignal(
        workspaceId,
        invitationId,
        "failed",
        "workspace_invitation",
      );
      console.error("workspace_invitation_email_delivery_failed");
    }
  });
}

export function workspaceInvitationUrl(token: string) {
  return `${getAppUrl()}/invitations/accept#token=${encodeURIComponent(token)}`;
}

export function scheduleClientInvitationEmail(
  to: string,
  projectName: string,
  token: string,
  invitationId: string,
) {
  const url = `${getAppUrl()}/client/invitations/accept#token=${encodeURIComponent(token)}`;
  const safeUrl = escapeHtml(url);
  after(async () => {
    let workspaceId: string | null = null;
    try {
      const invitation = await getDb()
        .select({
          workspaceId: projects.workspaceId,
          emailAttemptCount: clientProjectInvitations.emailAttemptCount,
        })
        .from(clientProjectInvitations)
        .innerJoin(
          projects,
          eq(projects.id, clientProjectInvitations.projectId),
        )
        .where(eq(clientProjectInvitations.id, invitationId))
        .limit(1);
      if (!invitation[0]) return;
      workspaceId = invitation[0].workspaceId;
      await consumeManagedEmailUsage({
        workspaceId: invitation[0].workspaceId,
        sourceType: "client_invitation",
        sourceId: invitationId,
        attemptNumber: invitation[0].emailAttemptCount + 1,
      });
      await deliver({
        to,
        subject: `Join ${projectName} in ScopeDelta`,
        text: `You have been invited to a ScopeDelta client project: ${url}\n\nThis link expires in seven days.`,
        html: `<p>You have been invited to the client workspace for <strong>${escapeHtml(projectName)}</strong>.</p><p><a href="${safeUrl}">Open client project</a></p><p>This link expires in seven days.</p>`,
      });
      await getDb()
        .update(clientProjectInvitations)
        .set({
          emailDeliveryState: "sent",
          emailAttemptCount: sql`${clientProjectInvitations.emailAttemptCount} + 1`,
          lastEmailAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientProjectInvitations.id, invitationId));
      await recordEmailSignal(
        workspaceId,
        invitationId,
        "succeeded",
        "client_invitation",
      );
    } catch {
      await getDb()
        .update(clientProjectInvitations)
        .set({
          emailDeliveryState: "failed",
          emailAttemptCount: sql`${clientProjectInvitations.emailAttemptCount} + 1`,
          lastEmailAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientProjectInvitations.id, invitationId));
      if (workspaceId) {
        await recordEmailSignal(
          workspaceId,
          invitationId,
          "failed",
          "client_invitation",
        );
      }
      console.error("client_invitation_email_delivery_failed");
    }
  });
}

export async function scheduleClientCollaborationNotificationEmails(
  dedupeKey: string,
) {
  try {
    getSmtpConfig();
  } catch {
    return 0;
  }
  try {
    const database = getDb();
    const notifications = await database
      .select({
        id: clientCollaborationNotifications.id,
        email: users.email,
        participantId: clientCollaborationNotifications.recipientParticipantId,
        workspaceId: clientCollaborationNotifications.workspaceId,
        emailAttemptCount: clientCollaborationNotifications.emailAttemptCount,
      })
      .from(clientCollaborationNotifications)
      .innerJoin(
        users,
        eq(users.id, clientCollaborationNotifications.recipientUserId),
      )
      .leftJoin(
        clientProjectParticipants,
        eq(
          clientProjectParticipants.id,
          clientCollaborationNotifications.recipientParticipantId,
        ),
      )
      .where(
        and(
          eq(clientCollaborationNotifications.dedupeKey, dedupeKey),
          inArray(clientCollaborationNotifications.emailDeliveryState, [
            "not_requested",
            "failed",
          ]),
          or(
            isNull(clientCollaborationNotifications.recipientParticipantId),
            isNull(clientProjectParticipants.revokedAt),
          ),
        ),
      );

    let scheduled = 0;
    for (const notification of notifications) {
      const queued = await database
        .update(clientCollaborationNotifications)
        .set({ emailDeliveryState: "pending" })
        .where(
          and(
            eq(clientCollaborationNotifications.id, notification.id),
            inArray(clientCollaborationNotifications.emailDeliveryState, [
              "not_requested",
              "failed",
            ]),
          ),
        )
        .returning({ id: clientCollaborationNotifications.id });
      if (!queued[0]) continue;
      scheduled += 1;

      const destination = notification.participantId ? "/client" : "/app";
      const url = `${getAppUrl()}${destination}`;
      after(async () => {
        try {
          await consumeManagedEmailUsage({
            workspaceId: notification.workspaceId,
            sourceType: "client_notification",
            sourceId: notification.id,
            attemptNumber: notification.emailAttemptCount + 1,
          });
          await deliver({
            to: notification.email,
            subject: "ScopeDelta needs your attention",
            text: `A shared project has an update that needs your attention: ${url}`,
            html: `<p>A shared project has an update that needs your attention.</p><p><a href="${escapeHtml(url)}">Open ScopeDelta</a></p>`,
          });
          await updateClientNotificationDelivery(notification.id, "sent");
          await recordEmailSignal(
            notification.workspaceId,
            notification.id,
            "succeeded",
            "client_notification",
          );
        } catch {
          await updateClientNotificationDelivery(notification.id, "failed");
          await recordEmailSignal(
            notification.workspaceId,
            notification.id,
            "failed",
            "client_notification",
          );
          console.error("client_notification_email_delivery_failed");
        }
      });
    }
    return scheduled;
  } catch {
    console.error("client_notification_email_queue_failed");
    return 0;
  }
}

async function updateClientNotificationDelivery(
  notificationId: string,
  state: "sent" | "failed",
) {
  await getDb()
    .update(clientCollaborationNotifications)
    .set({
      emailDeliveryState: state,
      emailAttemptCount: sql`${clientCollaborationNotifications.emailAttemptCount} + 1`,
      lastEmailAttemptAt: new Date(),
    })
    .where(eq(clientCollaborationNotifications.id, notificationId));
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

async function recordEmailSignal(
  workspaceId: string,
  subjectId: string,
  outcome: "succeeded" | "failed",
  dimension:
    "workspace_invitation" | "client_invitation" | "client_notification",
) {
  try {
    await recordWorkspaceProductSignal(getDb(), {
      workspaceId,
      eventType: "email_delivery",
      outcome,
      dimension,
      subjectId,
    });
  } catch {
    console.error("email_product_signal_record_failed");
  }
}
