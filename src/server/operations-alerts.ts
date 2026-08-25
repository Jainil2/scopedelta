import { createHash, randomUUID } from "node:crypto";

import nodemailer from "nodemailer";
import type { PoolClient } from "pg";

import { getPool } from "@/db";
import { getOperatorAlertConfig, getSmtpConfig } from "@/lib/env";
import { listOperatorSignals } from "@/server/self-service";
import { reconcileOperationalRecovery } from "@/server/operations-recovery";

type Signal = {
  signalType: string;
  workspaceId: string | null;
  source: string;
  code: string | null;
  severity: "warning" | "critical";
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
    ? value
    : null;
}

function objectRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

function flattenCurrentSignals(
  raw: Awaited<ReturnType<typeof listOperatorSignals>>,
  limit: number,
) {
  const attention = raw.attention as Record<string, unknown>;
  const signals: Signal[] = [];
  const completeSignalTypes = new Set<string>();
  const append = (signalType: string, rows: Array<Record<string, unknown>>) => {
    if (rows.length < limit) completeSignalTypes.add(signalType);
    for (const row of rows) {
      const workspaceId =
        typeof row.workspaceId === "string" ? row.workspaceId : null;
      const source = String(
        row.id ?? row.eventType ?? row.dimension ?? workspaceId ?? "aggregate",
      );
      const count = Number(row.failures ?? row.occurrenceCount ?? 1);
      signals.push({
        signalType,
        workspaceId,
        source,
        code: safeCode(row.code ?? row.status ?? row.dimension),
        severity:
          count >= 3 || row.status === "failed" ? "critical" : "warning",
      });
    }
  };
  append("ai_attention", objectRows(attention.ai));
  append("import_attention", objectRows(attention.imports));
  append("billing_event_attention", objectRows(attention.billing));
  append("billing_checkout_attention", objectRows(attention.billingCheckouts));
  append("github_delivery_attention", objectRows(attention.provider));
  append("github_repository_attention", objectRows(attention.repositories));
  append("managed_usage_eighty_percent", objectRows(attention.managedUsage));
  append("alert_delivery_failure", objectRows(attention.alertDelivery));
  append("lifecycle_pending", objectRows(attention.lifecycle));
  append("repeated_denial", objectRows(attention.repeated));
  const email = (attention.email ?? {}) as Record<string, unknown>;
  append("workspace_email_failure", objectRows(email.workspaceInvitations));
  append("client_email_failure", objectRows(email.clientInvitations));
  append("notification_email_failure", objectRows(email.notifications));
  return { signals, completeSignalTypes: [...completeSignalTypes] };
}

async function recoverStaleClaims(client: PoolClient) {
  const result = await client.query(
    `update operator_alert_deliveries
        set state = 'failed', error_code = 'stale_claim', updated_at = now()
      where state = 'claimed' and claimed_at < now() - interval '15 minutes'
      returning id`,
  );
  return result.rowCount ?? 0;
}

async function reconcileIncidents(
  client: PoolClient,
  signals: Signal[],
  completeSignalTypes: string[],
) {
  const observed: string[] = [];
  for (const signal of signals) {
    const fingerprint = hash(
      `${signal.signalType}:${signal.workspaceId ?? "global"}:${signal.source}`,
    );
    observed.push(fingerprint);
    await client.query(
      `insert into operator_incidents
        (id, fingerprint, workspace_id, signal_type, severity, safe_error_code,
         occurrence_count, first_observed_at, last_observed_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 1, now(), now(), now(), now())
       on conflict (fingerprint) do update set
         workspace_id = excluded.workspace_id,
         severity = excluded.severity,
         safe_error_code = excluded.safe_error_code,
         state = 'open', resolved_at = null,
         last_notified_at = case
           when operator_incidents.state = 'resolved' then null
           else operator_incidents.last_notified_at
         end,
         occurrence_count = operator_incidents.occurrence_count + 1,
         escalated_at = case
           when operator_incidents.state = 'resolved' then now()
           when operator_incidents.severity = 'warning' and excluded.severity = 'critical' then now()
           else operator_incidents.escalated_at
         end,
         last_observed_at = now(), updated_at = now()`,
      [
        randomUUID(),
        fingerprint,
        signal.workspaceId,
        signal.signalType,
        signal.severity,
        signal.code,
      ],
    );
  }
  if (completeSignalTypes.length) {
    await client.query(
      `update operator_incidents set state = 'resolved', resolved_at = now(), updated_at = now()
        where state = 'open'
          and signal_type = any($1::text[])
          and not (fingerprint = any($2::text[]))`,
      [completeSignalTypes, observed],
    );
  }
}

async function claimDigest(client: PoolClient, recipient: string) {
  const due = await client.query<{
    id: string;
    signal_type: string;
    severity: string;
    safe_error_code: string | null;
    escalated_at: Date;
  }>(
    `select id, signal_type, severity, safe_error_code, escalated_at
       from operator_incidents
      where state = 'open'
        and (last_notified_at is null or escalated_at > last_notified_at
             or last_notified_at < now() - interval '24 hours')
      order by severity desc, signal_type, id
      limit 200`,
  );
  if (!due.rows.length) return null;
  const reminderDay = new Date().toISOString().slice(0, 10);
  const digestKey = hash(
    [
      reminderDay,
      ...due.rows.map(
        (row) => `${row.id}:${new Date(row.escalated_at).toISOString()}`,
      ),
    ].join(":"),
  );
  const recipientHash = hash(recipient.toLowerCase());
  const id = randomUUID();
  const claimed = await client.query<{ id: string }>(
    `insert into operator_alert_deliveries
      (id, digest_key, recipient_hash, state, incident_count, claimed_at, created_at, updated_at)
     values ($1, $2, $3, 'claimed', $4, now(), now(), now())
     on conflict (digest_key) do update set
       state = 'claimed', claimed_at = now(), error_code = null, updated_at = now()
     where operator_alert_deliveries.state = 'failed'
     returning id`,
    [id, digestKey, recipientHash, due.rows.length],
  );
  if (!claimed.rows[0]) return null;
  return {
    deliveryId: claimed.rows[0].id,
    incidentIds: due.rows.map((row) => row.id),
    rows: due.rows,
  };
}

function digestBody(
  rows: Array<{
    signal_type: string;
    severity: string;
    safe_error_code: string | null;
  }>,
) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.severity}:${row.signal_type}:${row.safe_error_code ?? "none"}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [
    "ScopeDelta operator attention digest",
    "",
    ...[...grouped.entries()].map(([key, count]) => `${key}=${count}`),
    "",
    "This digest contains only bounded signal categories, safe error codes, and counts.",
  ].join("\n");
}

async function sendDigest(recipient: string, body: string) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth:
      smtp.user && smtp.password
        ? { user: smtp.user, pass: smtp.password }
        : undefined,
    connectionTimeout: 8_000,
    socketTimeout: 8_000,
  });
  await transporter.sendMail({
    from: smtp.from,
    to: recipient,
    subject: "ScopeDelta operator attention digest",
    text: body,
  });
}

export async function runOperationsAlerts() {
  const config = getOperatorAlertConfig();
  const recovery = await reconcileOperationalRecovery();
  const signalLimit = 200;
  const rawSignals = await listOperatorSignals(signalLimit);
  const client = await getPool().connect();
  let claim: Awaited<ReturnType<typeof claimDigest>> = null;
  let staleClaimsRecovered = 0;
  let signalCount = 0;
  try {
    await client.query("begin");
    staleClaimsRecovered = await recoverStaleClaims(client);
    const { signals, completeSignalTypes } = flattenCurrentSignals(
      rawSignals,
      signalLimit,
    );
    signalCount = signals.length;
    await reconcileIncidents(client, signals, completeSignalTypes);
    if (config.recipient) claim = await claimDigest(client, config.recipient);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  if (!config.recipient || !claim) {
    return {
      transport: config.recipient ? "smtp" : "disabled",
      outboundAttempted: false,
      signalCount,
      staleClaimsRecovered,
      recovery,
    };
  }
  try {
    await sendDigest(config.recipient, digestBody(claim.rows));
    await getPool().query(
      `update operator_alert_deliveries set state = 'sent', sent_at = now(), updated_at = now()
        where id = $1 and state = 'claimed'`,
      [claim.deliveryId],
    );
    await getPool().query(
      `update operator_incidents set last_notified_at = now(), updated_at = now()
        where id = any($1::uuid[]) and state = 'open'`,
      [claim.incidentIds],
    );
    return {
      transport: "smtp",
      outboundAttempted: true,
      delivered: true,
      incidentCount: claim.incidentIds.length,
      staleClaimsRecovered,
      recovery,
    };
  } catch {
    await getPool().query(
      `update operator_alert_deliveries
          set state = 'failed', error_code = 'smtp_delivery_failed', updated_at = now()
        where id = $1 and state = 'claimed'`,
      [claim.deliveryId],
    );
    return {
      transport: "smtp",
      outboundAttempted: true,
      delivered: false,
      errorCode: "smtp_delivery_failed",
      staleClaimsRecovered,
      recovery,
    };
  }
}
