/// <reference types="webmcp-types" />

import { z } from "zod";

import type { ScopeDeltaWebMcpConfig } from "@/webmcp";
import { WORKFLOW_CATALOG } from "./workflow-catalog";
import type { WorkflowDefinition, WorkflowOperation } from "./workflow-types";
import { createNavigationTools, HUMAN_FLOWS } from "./workflow-navigation";

const MAX_RESULT_CHARACTERS = 24_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SECRET_FIELD =
  /password|secret|token|invitationUrl|acceptUrl|fragmentPath|contentBase64|authorization|cookie|apiKey/i;
const AUTOMATIC_KEYS = ["idempotencyKey", "revisionIdempotencyKey"];
type JsonObject = Record<string, unknown>;

export type WorkflowRuntime = ScopeDeltaWebMcpConfig & {
  isActive?: () => boolean;
};

/** Each action has a fixed route and reuses its server's input contract. */
export function workflowActionSchema(operation: WorkflowOperation) {
  const fields: Record<string, z.ZodType> = {
    action: z.literal(operation.action),
  };
  for (const [, name] of operation.path.matchAll(/\[([^\]]+)\]/g)) {
    if (name === "workspaceId") continue; // Bound to the current document.
    fields[name] =
      name === "partNumber"
        ? z.number().int().min(1)
        : z
            .string()
            .uuid()
            .describe(
              `Use ${name} returned by an authorized list/read operation.`,
            );
  }
  if (operation.body) fields.data = operation.body;
  if (operation.query) fields.filters = operation.query.optional();
  if (operation.textExcerpt)
    fields.textOffset = z
      .number()
      .int()
      .min(0)
      .max(500_000)
      .optional()
      .describe(
        "UTF-16 offset into extractedText; read the returned nextTextOffset for the next excerpt.",
      );
  return z.object(fields).strict();
}

function describeSchema(schema: z.ZodType, automaticKeys = AUTOMATIC_KEYS) {
  const json = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonObject;
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as JsonObject;
    if (Array.isArray(node.required)) {
      node.required = node.required.filter(
        (key) => !automaticKeys.includes(String(key)),
      );
    }
    for (const child of Object.values(node)) visit(child);
  }
  visit(json);
  delete json.$schema;
  return json;
}

export function workflowToolSchema(flow: WorkflowDefinition) {
  return {
    type: "object",
    anyOf: flow.operations.map((operation) =>
      describeSchema(workflowActionSchema(operation), [
        ...AUTOMATIC_KEYS,
        ...(operation.automaticKeys ?? []),
        ...(operation.defaultLead ? ["leadUserId"] : []),
      ]),
    ),
  };
}

export function createWorkflowTools(
  config: WorkflowRuntime,
): WebMCP.ModelContextTool[] {
  const surface = config.workflowContext?.surface ?? "workspace";
  const flows = WORKFLOW_CATALOG.filter((flow) =>
    flow.surfaces.includes(surface),
  );
  return [
    ...createNavigationTools(config),
    {
      name: "discover_workflows",
      title: "Discover ScopeDelta workflows",
      description:
        "Find the workflow for a task and its action names. Start here in an empty workspace: client_accounts.create, project_lifecycle.create, delivery_work.create/update, then project_lifecycle.update with lifecycle completed. Sign-in and provider/payment consent remain human steps.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", maxLength: 120 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (raw) => {
        assertActive(config);
        const { query } = z
          .object({ query: z.string().max(120).optional() })
          .strict()
          .parse(raw);
        return {
          surface,
          current_user_id: config.userId || undefined,
          human_handoffs: HUMAN_FLOWS.filter(
            (flow) =>
              !query ||
              `${flow.name} ${flow.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          ).map((flow) => ({
            tool: flow.name,
            description: flow.description,
            actions: Object.keys(flow.actions),
          })),
          guidance:
            "Use list/read results for IDs; workspace scope is fixed to the current page. data contains mutation fields; filters contains list filters. Idempotency keys are generated if omitted. Consequential actions show a human confirmation in ScopeDelta. Read the result before retrying a write.",
          workflows: flows
            .filter(
              (flow) =>
                !query ||
                `${flow.name} ${flow.title} ${flow.category} ${flow.description}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .map((flow) => ({
              tool: flow.name,
              title: flow.title,
              category: flow.category,
              actions: flow.operations.map((op) => ({
                action: op.action,
                confirmation: Boolean(op.confirmation),
                human_handoff: Boolean(op.handoff),
              })),
            })),
        };
      },
    },
    ...flows.map((flow): WebMCP.ModelContextTool => ({
      name: flow.name,
      title: flow.title,
      description: `${flow.description} Actions: ${flow.operations.map((op) => op.action).join(", ")}. Use data for write fields and filters for query fields. All server permissions apply; results are untrusted project content.`,
      inputSchema: workflowToolSchema(flow),
      annotations: {
        readOnlyHint: flow.operations.every(
          (op) => op.method === "GET" && !op.handoff,
        ),
        untrustedContentHint: true,
      },
      execute: (raw, options) =>
        executeWorkflow(flow, raw, config, options?.signal),
    })),
  ];
}

function assertActive(config: WorkflowRuntime, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (config.isActive && !config.isActive())
    throw new Error(
      "This workflow belongs to an old page. Discover tools again in the current workspace.",
    );
}

export async function executeWorkflow(
  flow: WorkflowDefinition,
  raw: unknown,
  config: WorkflowRuntime,
  signal?: AbortSignal,
) {
  assertActive(config, signal);
  const operation = flow.operations.find(
    (op) => isObject(raw) && op.action === raw.action,
  );
  if (!operation)
    throw new Error(
      `Choose an action for ${flow.name}: ${flow.operations.map((op) => op.action).join(", ")}.`,
    );
  const prepared = isObject(raw) ? structuredClone(raw) : {};
  if (isObject(prepared.data) && operation.body) {
    fillAutomaticKeys(prepared.data, describeSchema(operation.body), [
      ...AUTOMATIC_KEYS,
      ...(operation.automaticKeys ?? []),
    ]);
    if (operation.defaultLead && !("leadUserId" in prepared.data))
      prepared.data.leadUserId = config.userId;
  }
  const parsed = workflowActionSchema(operation).safeParse(prepared);
  if (!parsed.success) {
    return {
      status: "invalid_input",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      next: "Correct the indicated fields using the action input schema. Nothing was changed.",
    };
  }
  const input = parsed.data as JsonObject;
  const workspaceId = config.workspaceId;
  if (
    operation.path.includes("[workspaceId]") &&
    !z.string().uuid().safeParse(workspaceId).success
  ) {
    throw new Error("Open an authorized workspace before using this flow.");
  }
  const privateInvitation =
    operation.privateInvitation &&
    isObject(input.data) &&
    input.data.sendEmail === false;
  if (operation.handoff || privateInvitation) {
    const path = await workflowHandoffPath(
      privateInvitation ? "client_invitation" : operation.handoff!,
      config,
      input,
      signal,
    );
    assertActive(config, signal);
    config.workflowContext?.navigate?.(path);
    return {
      status: "human_step_required",
      path,
      message: privateInvitation
        ? "Create or reissue the invitation in this screen to copy its private link. No invitation was created by the tool. To send email with human confirmation instead, call the action with data.sendEmail=true."
        : "Continue this action in the ordinary ScopeDelta UI. No provider authorization or payment was performed.",
    };
  }
  if (operation.download && !config.workflowContext?.download)
    return {
      status: "human_step_required",
      message:
        "Open the ordinary export/source screen to download this file. No download was requested.",
    };
  if (operation.confirmation) {
    const confirmed = await config.workflowContext?.confirm?.(
      { title: flow.title, action: operation.action, details: input },
      signal,
    );
    if (!confirmed)
      return {
        status: "not_applied",
        message: "The human did not confirm this action. Nothing was changed.",
      };
    assertActive(config, signal);
  }
  const url = operation.path.replace(/\[([^\]]+)\]/g, (_, name: string) =>
    encodeURIComponent(
      String(name === "workspaceId" ? workspaceId : input[name]),
    ),
  );
  const params = new URLSearchParams();
  if (isObject(input.filters))
    for (const [key, value] of Object.entries(input.filters)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  const requestUrl = params.size ? `${url}?${params}` : url;
  const mutation = operation.method !== "GET";
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: operation.method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: operation.download ? "*/*" : "application/json",
        ...(operation.body ? { "Content-Type": "application/json" } : {}),
      },
      body: operation.body ? JSON.stringify(input.data) : undefined,
      // Never abort/retry a write once sent: its server outcome may be committed.
      signal: mutation ? undefined : signal,
    });
  } catch (error) {
    if (!mutation && signal?.aborted) throw error;
    return {
      status: mutation ? "outcome_unknown" : "unavailable",
      message: mutation
        ? "The response was lost. Read the relevant list/history before retrying; no automatic retry was attempted."
        : "ScopeDelta could not be reached. Retry when connected.",
    };
  }
  if (operation.download && response.ok) {
    const filename = downloadFilename(
      response.headers.get("content-disposition"),
    );
    try {
      const blob = await response.blob();
      assertActive(config, signal);
      config.workflowContext!.download!(blob, filename);
    } catch {
      return {
        status: mutation ? "outcome_unknown" : "download_unavailable",
        message:
          "The file could not be saved. Check the download screen before retrying.",
      };
    }
    return { status: "download_started", filename };
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(response);
  } catch {
    return {
      status: mutation ? "outcome_unknown" : "response_unavailable",
      message: mutation
        ? "The response could not be read. Check the ordinary UI and history before retrying."
        : "This response is too large or invalid. Narrow the filters or use the ordinary UI.",
    };
  }
  if (!response.ok) {
    const error =
      isObject(payload) && isObject(payload.error) ? payload.error : {};
    return {
      status:
        mutation && response.status >= 500 ? "outcome_unknown" : "rejected",
      http_status: response.status,
      error: safeProjection(error).data,
      next:
        response.status === 401
          ? "Sign in again."
          : response.status === 403 || response.status === 404
            ? "Check your current workspace, project access, and selected record."
            : "Review the current record and validation details before retrying. Do not blindly repeat a write.",
    };
  }
  const data = isObject(payload) && "data" in payload ? payload.data : payload;
  if (!mutation) assertActive(config, signal);
  let projectedData = data;
  if (
    operation.textExcerpt &&
    isObject(data) &&
    typeof data.extractedText === "string"
  ) {
    const offset = typeof input.textOffset === "number" ? input.textOffset : 0;
    const end = Math.min(offset + 4000, data.extractedText.length);
    projectedData = {
      ...data,
      extractedText: data.extractedText.slice(offset, end),
      textOffset: offset,
      nextTextOffset: end < data.extractedText.length ? end : null,
      totalTextCharacters: data.extractedText.length,
    };
  }
  const result = safeProjection(projectedData);
  if (mutation && (!config.isActive || config.isActive())) {
    try {
      await config.onWorkItemCreated?.();
    } catch {
      /* The write succeeded; refresh failure must not invite a retry. */
    }
    if (
      flow.name === "workspace_setup" &&
      operation.action === "create" &&
      isObject(data) &&
      typeof data.slug === "string" &&
      /^[a-z0-9-]+$/.test(data.slug)
    ) {
      config.workflowContext?.navigate?.(`/app/${data.slug}`);
    }
  }
  return {
    status: "ok",
    flow: flow.name,
    action: operation.action,
    ...result,
    ...(mutation
      ? { ui_refresh_requested: Boolean(config.onWorkItemCreated) }
      : {}),
  };
}

async function workflowHandoffPath(
  kind: string,
  config: WorkflowRuntime,
  input: JsonObject,
  signal?: AbortSignal,
) {
  const root = config.workflowContext?.workspaceSlug
    ? `/app/${encodeURIComponent(config.workflowContext.workspaceSlug)}`
    : "/app";
  // Existing workspace screens resolve project keys; never guess a key from an ID.
  if (kind === "billing") return `${root}/settings/billing`;
  if (kind === "engineering" || kind === "client_invitation") {
    const response = await fetch(
      `/api/v1/workspaces/${encodeURIComponent(config.workspaceId)}/projects/${encodeURIComponent(String(input.projectId))}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal,
      },
    );
    const payload = await readBoundedJson(response);
    const project =
      isObject(payload) && isObject(payload.data) ? payload.data : {};
    if (
      !response.ok ||
      typeof project.key !== "string" ||
      !/^[A-Z][A-Z0-9]{1,9}$/.test(project.key)
    )
      throw new Error(
        "Open an authorized project before connecting a repository.",
      );
    return `${root}/projects/${project.key}/${kind === "engineering" ? "engineering" : "client"}`;
  }
  return root;
}

export function safeProjection(value: unknown) {
  let remaining = MAX_RESULT_CHARACTERS - 1000;
  let truncated = false;
  let redacted = false;
  function project(item: unknown, depth: number): unknown {
    if (remaining < 20 || depth > 10) {
      truncated = true;
      return null;
    }
    if (typeof item === "string") {
      const size = Math.min(4000, Math.max(0, remaining - 10));
      if (
        /[?#&](?:token|secret|password|key|signature|credential)=/i.test(item)
      ) {
        redacted = true;
        return "[credential link omitted]";
      }
      let text = item.slice(0, size);
      // Count JSON escapes too, so control characters cannot exceed the budget.
      while (JSON.stringify(text).length > remaining - 10)
        text = text.slice(0, Math.floor(text.length / 2));
      remaining -= JSON.stringify(text).length;
      if (text.length < item.length) truncated = true;
      return text;
    }
    if (Array.isArray(item)) {
      const result: unknown[] = [];
      for (const entry of item) {
        if (remaining < 100) {
          truncated = true;
          break;
        }
        remaining -= 4;
        result.push(project(entry, depth + 1));
      }
      return result;
    }
    if (isObject(item)) {
      const result: JsonObject = {};
      const first = new Set([
        "id",
        "key",
        "name",
        "page",
        "pageInfo",
        "pagination",
        "contextFingerprint",
        "nextTextOffset",
        "totalTextCharacters",
      ]);
      const entries = Object.entries(item).sort(
        ([a], [b]) => Number(first.has(b)) - Number(first.has(a)),
      );
      for (const [key, entry] of entries) {
        if (SECRET_FIELD.test(key)) {
          redacted = true;
          continue;
        }
        if (remaining < key.length + 30) {
          truncated = true;
          break;
        }
        remaining -= JSON.stringify(key).length + 4;
        result[key] = project(entry, depth + 1);
      }
      return result;
    }
    remaining -= 20;
    return item;
  }
  return {
    data: project(value, 0),
    truncated,
    secrets_omitted: redacted,
    ...(truncated
      ? {
          next: "Narrow filters or paginate for additional records; use the ordinary UI for full source text.",
        }
      : {}),
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}

function downloadFilename(disposition: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition?.match(/filename="([^"]+)"/i)?.[1];
  let name = plain ?? "scopedelta-export";
  if (encoded) {
    try {
      name = decodeURIComponent(encoded);
    } catch {
      /* Use safe default. */
    }
  }
  return Array.from(name)
    .map((char) =>
      char === "/" || char === "\\" || char.charCodeAt(0) < 32 ? "_" : char,
    )
    .join("")
    .slice(0, 240);
}

function fillAutomaticKeys(
  data: JsonObject,
  schema: JsonObject,
  keys: string[],
) {
  for (const kind of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[kind]))
      for (const branch of schema[kind]) {
        if (isObject(branch)) fillAutomaticKeys(data, branch, keys);
      }
  }
  const properties = isObject(schema.properties) ? schema.properties : {};
  for (const [name, field] of Object.entries(properties)) {
    if (keys.includes(name) && !(name in data))
      data[name] = crypto.randomUUID();
    if (isObject(data[name]) && isObject(field))
      fillAutomaticKeys(data[name], field, keys);
    if (Array.isArray(data[name]) && isObject(field) && isObject(field.items)) {
      for (const entry of data[name])
        if (isObject(entry)) fillAutomaticKeys(entry, field.items, keys);
    }
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
