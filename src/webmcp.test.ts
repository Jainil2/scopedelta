import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createScopeDeltaWebMcpTools,
  getWebMcpStatus,
  registerScopeDeltaWebMcp,
  resetWebMcpForTests,
  resolveModelContext,
  WEBMCP_INPUT_SCHEMAS,
  WEBMCP_TOOL_NAMES,
} from "@/webmcp";

type Tool = ReturnType<typeof createScopeDeltaWebMcpTools>[number];

const config = {
  workspaceId: "workspace-one",
  userId: "user-one",
  onWorkItemCreated: vi.fn(),
};

class MockModelContext extends EventTarget {
  tools: Tool[] = [];

  registerTool = vi.fn(async (tool: Tool) => {
    this.tools = [
      ...this.tools.filter((item) => item.name !== tool.name),
      tool,
    ];
  });

  getTools = vi.fn(async () => this.tools);
}

describe("ScopeDelta WebMCP schemas", () => {
  it("defines four strict, described object schemas with the expected annotations", () => {
    const tools = createScopeDeltaWebMcpTools(config);

    expect(tools.map((tool) => tool.name)).toEqual(WEBMCP_TOOL_NAMES);
    for (const tool of tools) {
      const schema =
        WEBMCP_INPUT_SCHEMAS[tool.name as keyof typeof WEBMCP_INPUT_SCHEMAS];
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(tool.description).toBeTruthy();
      for (const property of Object.values(schema.properties)) {
        expect(property.description).toBeTruthy();
      }
      expect(tool.annotations?.untrustedContentHint).toBe(true);
    }
    for (const tool of tools.slice(0, 3)) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
    expect(tools[3]?.annotations).not.toHaveProperty("readOnlyHint");
    expect(WEBMCP_INPUT_SCHEMAS.search_work_items.required).toEqual([
      "project_key",
      "query",
    ]);
    expect(WEBMCP_INPUT_SCHEMAS.create_work_item.required).toEqual([
      "project_key",
      "title",
    ]);
    expect(WEBMCP_INPUT_SCHEMAS.get_commercial_drift.required).toEqual([
      "project_key",
    ]);
    expect(WEBMCP_INPUT_SCHEMAS.list_my_work.required).toEqual([]);
    for (const name of [
      "list_my_work",
      "search_work_items",
      "create_work_item",
    ] as const) {
      expect(WEBMCP_INPUT_SCHEMAS[name].properties.status.enum).toEqual([
        "backlog",
        "ready",
        "in_progress",
        "in_review",
        "done",
        "canceled",
      ]);
      expect(WEBMCP_INPUT_SCHEMAS[name].properties.priority.enum).toEqual([
        "none",
        "low",
        "medium",
        "high",
        "urgent",
      ]);
    }
    expect(WEBMCP_INPUT_SCHEMAS.create_work_item.properties).not.toHaveProperty(
      "assigneeUserId",
    );
    expect(WEBMCP_INPUT_SCHEMAS.create_work_item.properties).not.toHaveProperty(
      "milestoneId",
    );
  });
});

describe("ScopeDelta WebMCP registration", () => {
  beforeEach(() => {
    resetWebMcpForTests(document);
    deleteModelContexts();
  });

  afterEach(() => {
    resetWebMcpForTests(document);
    deleteModelContexts();
  });

  it("degrades to an observable unavailable state when no context exists", async () => {
    const registration = registerScopeDeltaWebMcp(config);
    await registration.ready;

    expect(getWebMcpStatus()).toEqual({
      available: false,
      phase: "unavailable",
      registeredTools: [],
      failedTools: [],
    });
  });

  it("prefers document.modelContext and falls back to navigator only once", async () => {
    const documentContext = new MockModelContext();
    const navigatorContext = new MockModelContext();
    setModelContext(document, documentContext);
    setModelContext(navigator, navigatorContext);

    expect(resolveModelContext(document, navigator)).toBe(documentContext);
    await registerScopeDeltaWebMcp(config).ready;
    expect(documentContext.registerTool).toHaveBeenCalledTimes(4);
    expect(navigatorContext.registerTool).not.toHaveBeenCalled();

    delete (document as Document & { modelContext?: unknown }).modelContext;
    expect(resolveModelContext(document, navigator)).toBe(navigatorContext);
  });

  it("awaits each registration, isolates failures, and reports exact active names", async () => {
    const context = new MockModelContext();
    let releaseFirst!: () => void;
    context.registerTool.mockImplementation(async (tool: Tool) => {
      if (tool.name === "list_my_work") {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (tool.name === "search_work_items") throw new Error("unsupported");
      context.tools = [...context.tools, tool];
    });
    setModelContext(document, context);

    const registration = registerScopeDeltaWebMcp(config);
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(context.registerTool).toHaveBeenCalledTimes(1);
    expect(getWebMcpStatus().phase).toBe("registering");
    releaseFirst();
    await registration.ready;

    expect(context.registerTool).toHaveBeenCalledTimes(4);
    expect(getWebMcpStatus()).toEqual({
      available: true,
      phase: "available",
      registeredTools: [
        "list_my_work",
        "get_commercial_drift",
        "create_work_item",
      ],
      failedTools: ["search_work_items"],
    });
  });

  it("uses getTools reconciliation and tracked-success fallback", async () => {
    const reconciled = new MockModelContext();
    reconciled.getTools.mockImplementation(async () =>
      reconciled.tools.filter((tool) => tool.name !== "search_work_items"),
    );
    setModelContext(document, reconciled);
    await registerScopeDeltaWebMcp(config).ready;
    expect(getWebMcpStatus().registeredTools).not.toContain(
      "search_work_items",
    );
    reconciled.tools = reconciled.tools.filter(
      (tool) => tool.name !== "create_work_item",
    );
    reconciled.dispatchEvent(new Event("toolchange"));
    await vi.waitFor(() =>
      expect(getWebMcpStatus().registeredTools).not.toContain(
        "create_work_item",
      ),
    );

    resetWebMcpForTests(document);
    const fallback = new MockModelContext();
    fallback.getTools.mockRejectedValue(new Error("not implemented"));
    setModelContext(document, fallback);
    await registerScopeDeltaWebMcp(config).ready;
    expect(getWebMcpStatus().registeredTools).toEqual(WEBMCP_TOOL_NAMES);
  });

  it("aborts stale Strict Mode/HMR registrations and cleans every signal", async () => {
    const firstContext = new MockModelContext();
    const firstSignals: AbortSignal[] = [];
    firstContext.registerTool.mockImplementation(
      (tool: Tool, options?: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          const signal = options?.signal;
          if (signal) firstSignals.push(signal);
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          if (tool.name !== "list_my_work") resolve();
        }),
    );
    setModelContext(document, firstContext);
    const stale = registerScopeDeltaWebMcp(config);
    await vi.waitFor(() => expect(firstSignals).toHaveLength(1));

    const currentContext = new MockModelContext();
    const currentSignals: AbortSignal[] = [];
    currentContext.registerTool.mockImplementation(
      async (tool: Tool, options?: { signal?: AbortSignal }) => {
        if (options?.signal) currentSignals.push(options.signal);
        currentContext.tools.push(tool);
      },
    );
    setModelContext(document, currentContext);
    const current = registerScopeDeltaWebMcp(config);
    await Promise.all([stale.ready, current.ready]);

    expect(firstSignals[0]?.aborted).toBe(true);
    expect(currentSignals).toHaveLength(4);
    expect(new Set(currentSignals).size).toBe(4);
    deleteModelContexts();
    await registerScopeDeltaWebMcp(config).ready;
    for (const signal of currentSignals) expect(signal.aborted).toBe(true);
    expect(getWebMcpStatus().phase).toBe("unavailable");
    current.dispose();
  });
});

describe("ScopeDelta WebMCP execution adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists assigned work with echoed counts, bounded text, and no source bodies", async () => {
    const item = workItem({ title: "x".repeat(400), description: "secret" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ items: [item], pageInfo: { total: 7 } }),
        ),
    );

    const result = await execute("list_my_work", {
      query: "launch",
      priority: "high",
      limit: 1,
    });

    expect(result).toMatchObject({
      criteria: { query: "launch", priority: "high" },
      result_count: 1,
      total_count: 7,
      truncated: true,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500);
  });

  it("exact-matches a normalized authorized project key before searching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            project({ id: "wrong", key: "ACME2" }),
            project({ id: "right", key: "ACME" }),
          ],
          pageInfo: { total: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [workItem()], pageInfo: { total: 1 } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute("search_work_items", {
      project_key: "acme",
      query: "launch",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("query=ACME");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "projects/right/work-items",
    );
    expect(result).toMatchObject({ result_count: 1, total_count: 1 });
  });

  it("continues authorized project search past 100 substring matches", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      project({
        id: `wrong-${index}`,
        key: `W${String(index).padStart(3, "0")}`,
        name: `ACME matching project ${String(index).padStart(3, "0")}`,
      }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ items: firstPage, pageInfo: { total: 101 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [project({ id: "exact", key: "ACME" })],
          pageInfo: { total: 101 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [workItem()], pageInfo: { total: 1 } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      execute("search_work_items", { project_key: "ACME", query: "launch" }),
    ).resolves.toMatchObject({ result_count: 1 });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("page=2");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "projects/exact/work-items",
    );
  });

  it("returns an explicit zero-result envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ items: [project()], pageInfo: { total: 1 } }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ items: [], pageInfo: { total: 0 } }),
        ),
    );

    await expect(
      execute("search_work_items", { project_key: "ACME", query: "missing" }),
    ).resolves.toEqual({
      criteria: { project_key: "ACME", query: "missing", limit: 10 },
      total_count: 0,
      result_count: 0,
      truncated: false,
      results: [],
    });
  });

  it("queries the combined drift summary and returns advisory totals plus recent affected work", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/projects?")) {
        return Promise.resolve(
          jsonResponse({ items: [project()], pageInfo: { total: 1 } }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          counts: {
            linked: 4,
            stale_basis: 0,
            commercially_unlinked: 2,
            needs_classification: 0,
            support_internal: 0,
          },
          affected: [driftItem("commercially_unlinked")],
          affectedTotal: 2,
          baseline: null,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute("get_commercial_drift", {
      project_key: "ACME",
      limit: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/commercial/drift-summary?limit=3",
    );
    expect(result).toMatchObject({
      advisory_only: true,
      contractual_verdict_provided: false,
      counts: { commercially_unlinked: 2, linked: 4 },
      result_count: 1,
      truncated: true,
    });
  });

  it("creates assigned work through the existing endpoint and requests UI refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ items: [project()], pageInfo: { total: 1 } }),
      )
      .mockResolvedValueOnce(jsonResponse(workItem()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await execute("create_work_item", {
      project_key: "ACME",
      title: "Agent-created delivery task",
      assign_to_me: true,
      priority: "high",
    });

    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      title: "Agent-created delivery task",
      assigneeUserId: "user-one",
      priority: "high",
      labelIds: [],
    });
    expect(request.signal).toBeUndefined();
    expect(config.onWorkItemCreated).toHaveBeenCalledOnce();
    expect(result).toEqual({
      identifier: "ACME-7",
      title: "Launch work",
      project_key: "ACME",
      status: "backlog",
      priority: "medium",
      ui_refresh_requested: true,
    });
  });

  it("cancels reads but warns agents to search after an ambiguous create", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/projects?")) {
        if (init?.signal?.aborted) {
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        }
        return Promise.resolve(
          jsonResponse({ items: [project()], pageInfo: { total: 1 } }),
        );
      }
      expect(init?.signal).toBeUndefined();
      return Promise.reject(new TypeError("connection reset"));
    });
    vi.stubGlobal("fetch", fetchMock);

    controller.abort();
    await expect(
      execute(
        "search_work_items",
        { project_key: "ACME", query: "x" },
        controller.signal,
      ),
    ).rejects.toThrow("canceled");

    await expect(
      execute("create_work_item", { project_key: "ACME", title: "Maybe" }),
    ).rejects.toThrow("Search for the work item before retrying");
    expect(config.onWorkItemCreated).not.toHaveBeenCalled();
  });

  it.each([
    [401, "Sign in again"],
    [403, "unavailable to this user"],
    [404, "unavailable to this user"],
    [409, "Review current work state"],
    [503, "temporarily unavailable"],
  ])("returns a safe %s error", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "private body" } }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(execute("list_my_work", {})).rejects.toThrow(message);
  });

  it("rejects invalid and unmatched project input without calling downstream routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [project({ key: "OTHER" })],
        pageInfo: { total: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(execute("list_my_work", { limit: 11 })).rejects.toThrow(
      "Invalid fields: limit",
    );
    await expect(
      execute("list_my_work", { unexpected: "value" }),
    ).rejects.toThrow("Tool input is invalid");
    await expect(
      execute("search_work_items", { project_key: "ACME", query: "x" }),
    ).rejects.toThrow("No active authorized project matches");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

async function execute(
  name: string,
  input: unknown,
  signal = new AbortController().signal,
) {
  const tool = createScopeDeltaWebMcpTools(config).find(
    (item) => item.name === name,
  )!;
  return tool.execute(input as Record<string, unknown>, { signal });
}

function jsonResponse(data: unknown) {
  return Response.json({ data });
}

function project(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "project-one",
    key: "ACME",
    name: "Acme launch",
    clientName: "Acme Co",
    ...overrides,
  };
}

function workItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "work-one",
    identifier: "ACME-7",
    title: "Launch work",
    projectKey: "ACME",
    projectName: "Acme launch",
    clientName: "Acme Co",
    status: "backlog",
    priority: "medium",
    purpose: "client_delivery",
    milestoneName: "M1",
    cycleName: "Cycle 1",
    targetDate: "2026-09-01",
    commercialBasisCount: 1,
    ...overrides,
  };
}

function driftItem(state: string) {
  return {
    id: "work-one",
    number: 7,
    title: "Launch work",
    status: "backlog",
    purpose: "client_delivery",
    basisCount: 0,
    staleBasisCount: 0,
    state,
    updatedAt: "2026-08-27T10:00:00.000Z",
  };
}

function setModelContext(target: Document | Navigator, value: unknown) {
  Object.defineProperty(target, "modelContext", {
    configurable: true,
    value,
  });
}

function deleteModelContexts() {
  delete (document as Document & { modelContext?: unknown }).modelContext;
  delete (navigator as Navigator & { modelContext?: unknown }).modelContext;
}
