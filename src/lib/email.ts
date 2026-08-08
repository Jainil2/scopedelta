import { after } from "next/server";
import nodemailer from "nodemailer";

import { getAppUrl, getSmtpConfig } from "@/lib/env";

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
) {
  const url = `${getAppUrl()}/invitations/accept#token=${encodeURIComponent(token)}`;
  const safeUrl = escapeHtml(url);
  scheduleEmail({
    to,
    subject: `Join ${workspaceName} in ScopeDelta`,
    text: `You have been invited to join a ScopeDelta workspace: ${url}\n\nThis link expires in seven days.`,
    html: `<p>You have been invited to join <strong>${escapeHtml(workspaceName)}</strong> in ScopeDelta.</p><p><a href="${safeUrl}">Accept invitation</a></p><p>This link expires in seven days.</p>`,
  });
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
