/// <reference types="webmcp-types" />

import { z } from "zod";
import type { WorkflowContext } from "@/webmcp/workflow-types";

/**
 * Browser-only adapters for pre-existing authenticated ScopeDelta workflows.
 * Registrations are document-owned so remounts and hot reloads can cancel stale
 * work without introducing a backend agent identity or a second auth path.
 */

export const WEBMCP_TOOL_NAMES = [
  "list_my_work",
  "search_work_items",
  "get_commercial_drift",
  "create_work_item",
] as const;

const WORK_ITEM_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "canceled",
] as const;
const WORK_ITEM_PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
type DriftState =
  | "commercially_unlinked"
  | "needs_classification"
  | "stale_basis"
  | "linked"
  | "support_internal";
const MAX_TOOL_OUTPUT_CHARACTERS = 1_500;
const REGISTRY_KEY = Symbol.for("scopedelta.webmcp.registry");

type ToolName = string;
type ModelContext = WebMCP.ModelContext;
type CompatibleNavigator = Navigator & { modelContext?: ModelContext };

export type WebMcpStatus = {
  available: boolean;
  phase: "unavailable" | "registering" | "available";
  registeredTools: ToolName[];
  failedTools: ToolName[];
};

export type ScopeDeltaWebMcpConfig = {
  workspaceId: string;
  userId: string;
  onWorkItemCreated: () => void | Promise<void>;
  workflowContext?: WorkflowContext;
};

type RegistryRecord = {
  id: symbol;
  context: ModelContext;
  controllers: Set<AbortController>;
  successfulTools: Set<ToolName>;
  failedTools: Set<ToolName>;
  disposed: boolean;
  toolChangeListener?: EventListener;
};

type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  clientName: string;
};

type PageInfo = {
  total: number;
};

type MyWorkItem = {
  id: string;
  identifier: string;
  title: string;
  projectKey: string;
  projectName: string;
  clientName: string;
  status: string;
  priority: string;
  purpose: string;
  milestoneName: string | null;
  cycleName: string | null;
  targetDate: string | null;
  commercialBasisCount: number;
  commercialHistoricalBasisCount?: number;
  commercialStaleBasisCount?: number;
};

type WorkItem = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  purpose: string;
  milestoneName: string | null;
  cycleName: string | null;
  targetDate: string | null;
  commercialBasisCount: number;
  commercialHistoricalBasisCount?: number;
  commercialStaleBasisCount?: number;
};

type DriftItem = {
  id: string;
  number: number;
  title: string;
  status: string;
  purpose: string;
  basisCount: number;
  staleBasisCount: number;
  state: DriftState;
  updatedAt: string;
};

type DriftSnapshot = {
  counts: Record<DriftState, number>;
  affected: DriftItem[];
  affectedTotal: number;
};

type Projection<T> = { value: T; textTruncated: boolean };

const statusListeners = new Set<() => void>();
let currentStatus: WebMcpStatus = unavailableStatus();
const serverStatus = unavailableStatus();

const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/);
const statusSchema = z.enum(WORK_ITEM_STATUSES);
const prioritySchema = z.enum(WORK_ITEM_PRIORITIES);

const listMyWorkInputSchema = z
  .object({
    query: z.string().trim().min(1).max(120).optional(),
    project_key: projectKeySchema.optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict();

const searchWorkItemsInputSchema = z
  .object({
    project_key: projectKeySchema,
    query: z.string().trim().min(1).max(120),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict();

const commercialDriftInputSchema = z
  .object({
    project_key: projectKeySchema,
    limit: z.number().int().min(1).max(5).default(5),
  })
  .strict();

const createWorkItemInputSchema = z
  .object({
    project_key: projectKeySchema,
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(2_000).optional(),
    acceptance_criteria: z.string().trim().max(2_000).optional(),
    status: statusSchema.default("backlog"),
    priority: prioritySchema.default("none"),
    estimate_points: z.number().int().min(1).max(100).optional(),
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    assign_to_me: z.boolean().default(false),
  })
  .strict();

export const WEBMCP_INPUT_SCHEMAS = {
  list_my_work: {
    type: "object",
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description:
          "Optional title, project, client, number, or identifier search text.",
      },
      project_key: {
        type: "string",
        pattern: "^[A-Za-z][A-Za-z0-9]{1,9}$",
        description: "Optional human-readable project key, such as ACME.",
      },
      status: {
        type: "string",
        enum: WORK_ITEM_STATUSES,
        description:
          "Optional exact workflow status; omit for actionable work only.",
      },
      priority: {
        type: "string",
        enum: WORK_ITEM_PRIORITIES,
        description: "Optional exact work-item priority.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        default: 10,
        description:
          "Maximum records to inspect before the output character budget is applied.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  search_work_items: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        pattern: "^[A-Za-z][A-Za-z0-9]{1,9}$",
        description:
          "Human-readable key of the active project to search, such as ACME.",
      },
      query: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description:
          "Title, work number, or full work-item identifier to search for.",
      },
      status: {
        type: "string",
        enum: WORK_ITEM_STATUSES,
        description: "Optional exact workflow status.",
      },
      priority: {
        type: "string",
        enum: WORK_ITEM_PRIORITIES,
        description: "Optional exact work-item priority.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        default: 10,
        description:
          "Maximum records to inspect before the output character budget is applied.",
      },
    },
    required: ["project_key", "query"],
    additionalProperties: false,
  },
  get_commercial_drift: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        pattern: "^[A-Za-z][A-Za-z0-9]{1,9}$",
        description:
          "Human-readable key of the active project to review, such as ACME.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        default: 5,
        description:
          "Maximum affected records to return before the output budget is applied.",
      },
    },
    required: ["project_key"],
    additionalProperties: false,
  },
  create_work_item: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        pattern: "^[A-Za-z][A-Za-z0-9]{1,9}$",
        description:
          "Human-readable key of the active project that will own the work.",
      },
      title: {
        type: "string",
        minLength: 1,
        maxLength: 240,
        description: "Concise title for the new work item.",
      },
      description: {
        type: "string",
        maxLength: 2_000,
        description: "Optional bounded implementation or delivery context.",
      },
      acceptance_criteria: {
        type: "string",
        maxLength: 2_000,
        description: "Optional factual conditions that define completion.",
      },
      status: {
        type: "string",
        enum: WORK_ITEM_STATUSES,
        default: "backlog",
        description: "Initial workflow status.",
      },
      priority: {
        type: "string",
        enum: WORK_ITEM_PRIORITIES,
        default: "none",
        description: "Initial work-item priority.",
      },
      estimate_points: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Optional existing ScopeDelta estimate-points value.",
      },
      target_date: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Optional target date in YYYY-MM-DD format.",
      },
      assign_to_me: {
        type: "boolean",
        default: false,
        description: "Assign the item to the authenticated user when true.",
      },
    },
    required: ["project_key", "title"],
    additionalProperties: false,
  },
} as const;

/**
 * Builds ScopeDelta's complete WebMCP surface. To add a tool, define its strict
 * JSON Schema beside the existing schemas, validate again inside execute, call
 * an existing authorized application endpoint, and add its name to
 * WEBMCP_TOOL_NAMES so lifecycle/status reconciliation remains accurate.
 */
export function createScopeDeltaWebMcpTools(
  config: ScopeDeltaWebMcpConfig,
): WebMCP.ModelContextTool[] {
  return [
    {
      name: "list_my_work",
      description:
        "List the authenticated user's actionable assigned work across authorized active projects. Use project search for work not assigned to this user.",
      inputSchema: WEBMCP_INPUT_SCHEMAS.list_my_work,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (rawInput, options) => {
        const input = parseToolInput(listMyWorkInputSchema, rawInput);
        const project = input.project_key
          ? await resolveProject(
              config.workspaceId,
              input.project_key,
              options?.signal,
            )
          : undefined;
        const query = queryString({
          page: 1,
          pageSize: input.limit,
          query: input.query,
          projectKey: project?.key,
          status: input.status,
          priority: input.priority,
        });
        const response = await apiRequest<{
          items: MyWorkItem[];
          pageInfo: PageInfo;
        }>(`/api/v1/workspaces/${config.workspaceId}/my-work?${query}`, {
          signal: options?.signal,
        });
        const projected = response.items.map(projectMyWorkItem);
        return boundedResultEnvelope(
          {
            criteria: compactObject({
              query: input.query,
              project_key: project?.key,
              status: input.status,
              priority: input.priority,
              limit: input.limit,
            }),
            total_count: response.pageInfo.total,
          },
          projected,
          response.pageInfo.total,
        );
      },
    },
    {
      name: "search_work_items",
      description:
        "Search active work in one authorized project by title, number, or identifier. Returns compact delivery facts and commercial provenance counts.",
      inputSchema: WEBMCP_INPUT_SCHEMAS.search_work_items,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (rawInput, options) => {
        const input = parseToolInput(searchWorkItemsInputSchema, rawInput);
        const project = await resolveProject(
          config.workspaceId,
          input.project_key,
          options?.signal,
        );
        const query = queryString({
          page: 1,
          pageSize: input.limit,
          query: input.query,
          status: input.status,
          priority: input.priority,
        });
        const response = await apiRequest<{
          items: WorkItem[];
          pageInfo: PageInfo;
        }>(
          `/api/v1/workspaces/${config.workspaceId}/projects/${project.id}/work-items?${query}`,
          { signal: options?.signal },
        );
        const projected = response.items.map((item) =>
          projectWorkItem(item, project),
        );
        return boundedResultEnvelope(
          {
            criteria: compactObject({
              project_key: input.project_key,
              query: input.query,
              status: input.status,
              priority: input.priority,
              limit: input.limit,
            }),
            total_count: response.pageInfo.total,
          },
          projected,
          response.pageInfo.total,
        );
      },
    },
    {
      name: "get_commercial_drift",
      description:
        "Report advisory Commercial Delivery Graph drift for one authorized project. Returns factual category totals and recently updated affected work, not a contractual verdict.",
      inputSchema: WEBMCP_INPUT_SCHEMAS.get_commercial_drift,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (rawInput, options) => {
        const input = parseToolInput(commercialDriftInputSchema, rawInput);
        const project = await resolveProject(
          config.workspaceId,
          input.project_key,
          options?.signal,
        );
        const snapshot = await apiRequest<DriftSnapshot>(
          `/api/v1/workspaces/${config.workspaceId}/projects/${project.id}/commercial/drift-summary?${queryString({ limit: input.limit })}`,
          { signal: options?.signal },
        );
        const affected = snapshot.affected.map((item) =>
          projectDriftItem(item, project),
        );
        return boundedResultEnvelope(
          {
            project: {
              key: project.key,
              name: truncateText(project.name, 80).value,
              client_name: truncateText(project.clientName, 80).value,
            },
            criteria: { project_key: project.key, limit: input.limit },
            advisory_only: true,
            contractual_verdict_provided: false,
            counts: snapshot.counts,
          },
          affected,
          snapshot.affectedTotal,
          "affected",
        );
      },
    },
    {
      name: "create_work_item",
      description:
        "Create a normal work item in one authorized active project using ScopeDelta's existing validation, numbering, audit, assignment, and UI refresh path.",
      inputSchema: WEBMCP_INPUT_SCHEMAS.create_work_item,
      annotations: { untrustedContentHint: true },
      execute: async (rawInput, options) => {
        const input = parseToolInput(createWorkItemInputSchema, rawInput);
        const project = await resolveProject(
          config.workspaceId,
          input.project_key,
          options?.signal,
        );
        options?.signal?.throwIfAborted();
        const created = await apiRequest<WorkItem>(
          `/api/v1/workspaces/${config.workspaceId}/projects/${project.id}/work-items`,
          {
            method: "POST",
            body: {
              title: input.title,
              description: input.description ?? null,
              acceptanceCriteria: input.acceptance_criteria ?? null,
              status: input.status,
              priority: input.priority,
              assigneeUserId: input.assign_to_me ? config.userId : null,
              estimatePoints: input.estimate_points ?? null,
              targetDate: input.target_date ?? null,
              labelIds: [],
            },
            mutation: true,
          },
        );
        try {
          await config.onWorkItemCreated();
        } catch {
          // Creation is confirmed; a refresh failure must never invite a retry.
        }
        return {
          identifier: created.identifier,
          title: truncateText(created.title, 240).value,
          project_key: project.key,
          status: created.status,
          priority: created.priority,
          ui_refresh_requested: true,
        };
      },
    },
  ];
}

export function registerScopeDeltaWebMcp(
  config: ScopeDeltaWebMcpConfig,
  targetDocument: Document = document,
  targetNavigator: Navigator = navigator,
): { ready: Promise<void>; dispose: () => void } {
  const host = targetDocument as Document & Record<symbol, unknown>;
  const previous = host[REGISTRY_KEY] as RegistryRecord | undefined;
  disposeRegistry(previous, host);

  const context = resolveModelContext(targetDocument, targetNavigator);
  if (!context) {
    setStatus(unavailableStatus());
    return { ready: Promise.resolve(), dispose: () => undefined };
  }

  const registry: RegistryRecord = {
    id: Symbol("scopedelta-webmcp-registration"),
    context,
    controllers: new Set(),
    successfulTools: new Set(),
    failedTools: new Set(),
    disposed: false,
  };
  host[REGISTRY_KEY] = registry;
  setStatus({
    available: true,
    phase: "registering",
    registeredTools: [],
    failedTools: [],
  });

  const ready = registerTools(registry, host, config);
  return {
    ready,
    dispose: () => disposeRegistry(registry, host),
  };
}

export function resolveModelContext(
  targetDocument: Document,
  targetNavigator: Navigator,
) {
  return (
    targetDocument.modelContext ??
    (targetNavigator as CompatibleNavigator).modelContext
  );
}

export function subscribeWebMcpStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getWebMcpStatus() {
  return currentStatus;
}

export function getServerWebMcpStatus() {
  return serverStatus;
}

export function resetWebMcpForTests(targetDocument?: Document) {
  if (targetDocument) {
    const host = targetDocument as Document & Record<symbol, unknown>;
    disposeRegistry(host[REGISTRY_KEY] as RegistryRecord | undefined, host);
  }
  currentStatus = unavailableStatus();
  statusListeners.clear();
}

async function registerTools(
  registry: RegistryRecord,
  host: Document & Record<symbol, unknown>,
  config: ScopeDeltaWebMcpConfig,
) {
  const tools =
    config.workflowContext && config.workflowContext.surface !== "workspace"
      ? []
      : createScopeDeltaWebMcpTools(config);
  if (config.workflowContext) {
    const { createWorkflowTools } = await import("@/webmcp/workflows");
    if (!isCurrentRegistry(registry, host)) return;
    let selected: { name: string; controller: AbortController } | undefined;
    let loading: Promise<boolean> = Promise.resolve(false);
    tools.push(
      ...createWorkflowTools({
        ...config,
        isActive: () => isCurrentRegistry(registry, host),
        loadWorkflow: (tool) => {
          // Serialize replacement so concurrent discovery cannot accumulate tools.
          loading = loading.then(async () => {
            if (!isCurrentRegistry(registry, host)) return false;
            if (selected) {
              selected.controller.abort();
              registry.controllers.delete(selected.controller);
              registry.successfulTools.delete(selected.name);
              registry.failedTools.delete(selected.name);
            }
            selected = { name: tool.name, controller: new AbortController() };
            const loaded = await registerDocumentTool(
              registry,
              host,
              tool,
              selected.controller,
            );
            await reconcileStatus(registry, host, "available");
            return loaded;
          });
          return loading;
        },
      }),
    );
  }
  for (const tool of tools) {
    if (!isCurrentRegistry(registry, host)) break;
    await registerDocumentTool(registry, host, tool, new AbortController());
    await reconcileStatus(registry, host);
  }

  if (!isCurrentRegistry(registry, host)) return;
  registry.toolChangeListener = () => {
    void reconcileStatus(registry, host, "available");
  };
  registry.context.addEventListener?.(
    "toolchange",
    registry.toolChangeListener,
  );
  await reconcileStatus(registry, host, "available");
}

async function registerDocumentTool(
  registry: RegistryRecord,
  host: Document & Record<symbol, unknown>,
  tool: WebMCP.ModelContextTool,
  controller: AbortController,
) {
  registry.controllers.add(controller);
  try {
    const documentTool: WebMCP.ModelContextTool = {
      ...tool,
      execute: (input, options) => {
        if (!isCurrentRegistry(registry, host))
          throw new Error(
            "This tool belongs to an old page. Discover tools again.",
          );
        const signal = options?.signal
          ? AbortSignal.any([controller.signal, options.signal])
          : controller.signal;
        signal.throwIfAborted();
        return tool.execute(input, { ...options, signal });
      },
    };
    await registry.context.registerTool(documentTool, {
      signal: controller.signal,
    });
    if (!isCurrentRegistry(registry, host) || controller.signal.aborted) {
      controller.abort();
      return false;
    }
    registry.successfulTools.add(tool.name);
    return true;
  } catch {
    controller.abort();
    registry.controllers.delete(controller);
    if (!registry.disposed) registry.failedTools.add(tool.name);
    return false;
  }
}

async function reconcileStatus(
  registry: RegistryRecord,
  host: Document & Record<symbol, unknown>,
  phase: WebMcpStatus["phase"] = "registering",
) {
  if (!isCurrentRegistry(registry, host)) return;
  let registeredTools = [...registry.successfulTools];
  if (typeof registry.context.getTools === "function") {
    try {
      const discovered = new Set(
        (await registry.context.getTools()).map((tool) => tool.name),
      );
      registeredTools = registeredTools.filter((name) => discovered.has(name));
    } catch {
      // Awaited registration outcomes remain an accurate fallback for older runtimes.
    }
  }
  if (!isCurrentRegistry(registry, host)) return;
  setStatus({
    available: true,
    phase,
    registeredTools,
    failedTools: [...registry.failedTools],
  });
}

function disposeRegistry(
  registry: RegistryRecord | undefined,
  host: Document & Record<symbol, unknown>,
) {
  if (!registry || registry.disposed) return;
  registry.disposed = true;
  for (const controller of registry.controllers) controller.abort();
  if (registry.toolChangeListener) {
    registry.context.removeEventListener?.(
      "toolchange",
      registry.toolChangeListener,
    );
  }
  if (host[REGISTRY_KEY] === registry) {
    delete host[REGISTRY_KEY];
    setStatus(unavailableStatus());
  }
}

function isCurrentRegistry(
  registry: RegistryRecord,
  host: Document & Record<symbol, unknown>,
) {
  return !registry.disposed && host[REGISTRY_KEY] === registry;
}

async function resolveProject(
  workspaceId: string,
  projectKey: string,
  signal?: AbortSignal,
) {
  const normalizedKey = projectKey.toUpperCase();
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const query = queryString({
      page,
      pageSize,
      query: normalizedKey,
      lifecycle: "active",
    });
    const response = await apiRequest<{
      items: ProjectSummary[];
      pageInfo: PageInfo;
    }>(`/api/v1/workspaces/${workspaceId}/projects?${query}`, { signal });
    const project = response.items.find((item) => item.key === normalizedKey);
    if (project) return project;
    if (
      response.items.length === 0 ||
      page * pageSize >= response.pageInfo.total
    ) {
      break;
    }
  }
  throw new Error(
    `No active authorized project matches project_key ${normalizedKey}. Check the key in ScopeDelta and retry.`,
  );
}

async function apiRequest<T>(
  url: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    mutation?: boolean;
  } = {},
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: options.body
        ? { "content-type": "application/json" }
        : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.mutation ? undefined : options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw new Error("Tool execution was canceled.");
    if (options.mutation) {
      throw new Error(
        "The create request ended without a confirmed response. Search for the work item before retrying to avoid a duplicate.",
      );
    }
    throw new Error(
      "ScopeDelta could not be reached. Check the current session and connection, then retry.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.data === undefined) {
    throw new Error(safeApiError(response.status, options.mutation));
  }
  return payload.data;
}

function safeApiError(status: number, mutation = false) {
  if (status === 400) {
    return "ScopeDelta rejected the input. Check required fields, formats, and allowed enum values, then retry.";
  }
  if (status === 401) {
    return "The authenticated ScopeDelta session is no longer active. Sign in again before retrying.";
  }
  if (status === 403 || status === 404) {
    return "The requested workspace or project is unavailable to this user. Check project_key and current access before retrying.";
  }
  if (status === 409) {
    return "ScopeDelta could not apply the request in its current state. Review current work state before retrying.";
  }
  if (mutation) {
    return "ScopeDelta did not confirm creation. Search for the work item before retrying to avoid a duplicate.";
  }
  return "ScopeDelta is temporarily unavailable. Retry after the application is reachable.";
}

function parseToolInput<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues
          .map((issue) => issue.path[0])
          .filter((field): field is PropertyKey => field !== undefined)
          .map(String),
      ),
    ];
    const suffix = fields.length
      ? ` Invalid fields: ${fields.join(", ")}.`
      : "";
    throw new Error(
      `Tool input is invalid.${suffix} Correct the input and retry.`,
    );
  }
  return parsed.data;
}

function projectMyWorkItem(
  item: MyWorkItem,
): Projection<Record<string, unknown>> {
  const title = truncateText(item.title, 160);
  const projectName = truncateText(item.projectName, 80);
  const clientName = truncateText(item.clientName, 80);
  return {
    value: {
      id: item.id,
      identifier: item.identifier,
      title: title.value,
      project_key: item.projectKey,
      project_name: projectName.value,
      client_name: clientName.value,
      status: item.status,
      priority: item.priority,
      milestone: item.milestoneName,
      cycle: item.cycleName,
      target_date: item.targetDate,
      commercial: {
        purpose: item.purpose,
        effective_basis_count: item.commercialBasisCount,
        historical_basis_count: item.commercialHistoricalBasisCount ?? 0,
        stale_basis_count: item.commercialStaleBasisCount ?? 0,
      },
    },
    textTruncated:
      title.truncated || projectName.truncated || clientName.truncated,
  };
}

function projectWorkItem(
  item: WorkItem,
  project: ProjectSummary,
): Projection<Record<string, unknown>> {
  const title = truncateText(item.title, 160);
  const projectName = truncateText(project.name, 80);
  const clientName = truncateText(project.clientName, 80);
  return {
    value: {
      id: item.id,
      identifier: item.identifier,
      title: title.value,
      project_key: project.key,
      project_name: projectName.value,
      client_name: clientName.value,
      status: item.status,
      priority: item.priority,
      milestone: item.milestoneName,
      cycle: item.cycleName,
      target_date: item.targetDate,
      commercial: {
        purpose: item.purpose,
        effective_basis_count: item.commercialBasisCount,
        historical_basis_count: item.commercialHistoricalBasisCount ?? 0,
        stale_basis_count: item.commercialStaleBasisCount ?? 0,
      },
    },
    textTruncated:
      title.truncated || projectName.truncated || clientName.truncated,
  };
}

function projectDriftItem(
  item: DriftItem,
  project: ProjectSummary,
): Projection<Record<string, unknown>> {
  const title = truncateText(item.title, 160);
  return {
    value: {
      id: item.id,
      identifier: `${project.key}-${item.number}`,
      title: title.value,
      status: item.status,
      state: item.state,
      purpose: item.purpose,
      effective_basis_count: item.basisCount,
      stale_basis_count: item.staleBasisCount,
      updated_at: item.updatedAt,
    },
    textTruncated: title.truncated,
  };
}

function boundedResultEnvelope(
  base: Record<string, unknown>,
  candidates: Projection<Record<string, unknown>>[],
  totalCount: number,
  resultsKey = "results",
) {
  const accepted: Record<string, unknown>[] = [];
  let textTruncated = false;
  for (const candidate of candidates) {
    const trial = {
      ...base,
      result_count: accepted.length + 1,
      truncated: true,
      [resultsKey]: [...accepted, candidate.value],
    };
    if (JSON.stringify(trial).length > MAX_TOOL_OUTPUT_CHARACTERS) break;
    accepted.push(candidate.value);
    textTruncated ||= candidate.textTruncated;
  }
  return {
    ...base,
    result_count: accepted.length,
    truncated:
      textTruncated ||
      accepted.length < candidates.length ||
      accepted.length < totalCount,
    [resultsKey]: accepted,
  };
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return { value, truncated: false };
  return {
    value: `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`,
    truncated: true,
  };
}

function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

function compactObject(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function unavailableStatus(): WebMcpStatus {
  return {
    available: false,
    phase: "unavailable",
    registeredTools: [],
    failedTools: [],
  };
}

function setStatus(status: WebMcpStatus) {
  currentStatus = status;
  for (const listener of statusListeners) listener();
}
