import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WORKFLOW_CATALOG } from "./workflow-catalog";
import {
  createWorkflowTools,
  executeWorkflow,
  safeProjection,
  workflowToolSchema,
  type WorkflowRuntime,
} from "./workflows";
import {
  getWebMcpStatus,
  registerScopeDeltaWebMcp,
  resetWebMcpForTests,
} from "@/webmcp";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const projectId = "10000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000003";
let config: WorkflowRuntime;
let fetchMock: ReturnType<typeof vi.fn>;
const flow = (name: string) =>
  WORKFLOW_CATALOG.find((item) => item.name === name)!;
const execute = (name: string, input: unknown, signal?: AbortSignal) =>
  executeWorkflow(flow(name), input, config, signal);
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  fetchMock = vi
    .fn()
    .mockImplementation(async () => response({ id: projectId }));
  vi.stubGlobal("fetch", fetchMock);
  config = {
    workspaceId,
    userId,
    onWorkItemCreated: vi.fn(),
    isActive: () => true,
    workflowContext: {
      surface: "workspace",
      workspaceSlug: "test-studio",
      confirm: vi.fn(async () => true),
      navigate: vi.fn(),
      download: vi.fn(),
    },
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetWebMcpForTests(document);
});

describe("workflow coverage and surface isolation", () => {
  it("maps every catalog operation to an implemented API handler and serializable schema", () => {
    expect(new Set(WORKFLOW_CATALOG.map((item) => item.name)).size).toBe(
      WORKFLOW_CATALOG.length,
    );
    for (const item of WORKFLOW_CATALOG) {
      expect(new Set(item.operations.map((op) => op.action)).size).toBe(
        item.operations.length,
      );
      expect(() => JSON.stringify(workflowToolSchema(item))).not.toThrow();
      for (const op of item.operations) {
        const path = `src/app${op.path}/route.ts`;
        expect(existsSync(path), path).toBe(true);
        expect(readFileSync(path, "utf8"), `${op.method} ${path}`).toContain(
          `export async function ${op.method}(`,
        );
        if (op.method === "DELETE") expect(op.confirmation).toBe(true);
      }
    }
  });
  it("provides only onboarding actions before a workspace exists and client projections in the portal", () => {
    config.workflowContext!.surface = "setup";
    let names = createWorkflowTools(config).map((tool) => tool.name);
    expect(names).toContain("workspace_setup");
    expect(names).not.toContain("delivery_work");
    config.workflowContext!.surface = "client";
    names = createWorkflowTools(config).map((tool) => tool.name);
    expect(names).toContain("client_project_access");
    expect(names).toContain("client_packet_response");
    expect(names).not.toContain("commercial_decisions");
    expect(names).not.toContain("workspace_setup");
  });
  it("registers the expanded tools, then removes workspace access when the document changes surface", async () => {
    const registered = new Map<string, WebMCP.ModelContextTool>();
    const context = {
      registerTool: vi.fn(
        async (
          tool: WebMCP.ModelContextTool,
          options?: { signal?: AbortSignal },
        ) => {
          registered.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => {
            if (registered.get(tool.name) === tool)
              registered.delete(tool.name);
          });
        },
      ),
      getTools: async () => [...registered.values()],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const doc = Object.assign(document.implementation.createHTMLDocument(), {
      modelContext: context,
    }) as unknown as Document;
    const first = registerScopeDeltaWebMcp(config, doc);
    await first.ready;
    const staleTool = registered.get("client_accounts")!;
    expect(getWebMcpStatus().registeredTools).toContain("project_lifecycle");
    const second = registerScopeDeltaWebMcp(
      { ...config, workspaceId: "", workflowContext: { surface: "client" } },
      doc,
    );
    await second.ready;
    expect(registered.has("delivery_work")).toBe(false);
    expect(registered.has("client_project_access")).toBe(true);
    await expect(
      Promise.resolve().then(() =>
        staleTool.execute(
          { action: "list" },
          { signal: new AbortController().signal },
        ),
      ),
    ).rejects.toThrow(/old page/);
    second.dispose();
    expect(registered.size).toBe(0);
  });
});

describe("ordinary API actions", () => {
  it("creates a project from an empty workspace with the current user as default lead", async () => {
    const result = await execute("project_lifecycle", {
      action: "create",
      data: { clientId: projectId, key: "WEB", name: "Website launch" },
    });
    expect(result).toMatchObject({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/workspaces/${workspaceId}/projects`);
    expect(init).toMatchObject({
      credentials: "same-origin",
      redirect: "error",
      method: "POST",
    });
    expect(JSON.parse(init.body)).toMatchObject({
      leadUserId: userId,
      key: "WEB",
    });
    expect(config.onWorkItemCreated).toHaveBeenCalledOnce();
    expect(config.workflowContext!.confirm).not.toHaveBeenCalled();
  });
  it("rejects a caller-supplied workspace or URL and invalid IDs before network access", async () => {
    for (const input of [
      { action: "list", workspaceId: projectId },
      { action: "list", url: "https://attacker.test" },
      { action: "read", projectId: "../other" },
    ])
      expect(await execute("project_lifecycle", input)).toMatchObject({
        status: "invalid_input",
      });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("serializes transformed filters and preserves pagination", async () => {
    await execute("project_notes", {
      action: "list",
      projectId,
      filters: { archived: "true", page: 2, pageSize: 10 },
    });
    expect(fetchMock.mock.calls[0][0]).toContain("archived=true");
    expect(fetchMock.mock.calls[0][0]).toContain("page=2");
  });
  it("generates comment retry keys and preserves explicit keys", async () => {
    await execute("work_discussion", {
      action: "post",
      projectId,
      workItemId: projectId,
      data: { body: "Ready for review" },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(z.string().uuid().safeParse(body.requestId).success).toBe(true);
    await execute("work_discussion", {
      action: "post",
      projectId,
      workItemId: projectId,
      data: { body: "Ready for review", requestId: userId },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).requestId).toBe(userId);
  });
  it("encodes pasted Unicode source text using the existing upload contract", async () => {
    await execute("commercial_evidence", {
      action: "add_text",
      projectId,
      data: { name: "Signed scope", text: "Website launch — café ✓" },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.kind).toBe("pasted_text");
    expect(Buffer.from(body.contentBase64, "base64").toString("utf8")).toBe(
      "Website launch — café ✓",
    );
    expect(z.string().uuid().safeParse(body.idempotencyKey).success).toBe(true);
  });
  it("fills nested impact idempotency keys through nullable schemas", async () => {
    const result = await execute("commercial_requests", {
      action: "create",
      projectId,
      data: {
        title: "Added page",
        requestText: "Add another page",
        receivedAt: "2026-09-03T10:00:00Z",
        impact: { confidence: "estimate", effortMinutes: 60 },
      },
    });
    expect(result).toMatchObject({ status: "ok" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(
      z.string().uuid().safeParse(body.impact.idempotencyKey).success,
    ).toBe(true);
    expect(body.idempotencyKey).not.toBe(body.impact.idempotencyKey);
  });
  it("preserves engineering artifact IDs needed by linking and verification flows", () => {
    expect(
      safeProjection({
        artifacts: [{ id: projectId, title: "PR #1" }],
        artifactId: projectId,
      }),
    ).toMatchObject({
      data: { artifacts: [{ id: projectId }], artifactId: projectId },
      secrets_omitted: false,
    });
  });
  it("returns subsequent source excerpts with stable evidence offsets", async () => {
    fetchMock.mockResolvedValue(
      response({
        extractedText: "a".repeat(4000) + "signed terms",
        id: projectId,
      }),
    );
    expect(
      await execute("commercial_evidence", {
        action: "read_source",
        projectId,
        sourceId: projectId,
        textOffset: 4000,
      }),
    ).toMatchObject({
      data: {
        extractedText: "signed terms",
        textOffset: 4000,
        nextTextOffset: null,
        totalTextCharacters: 4012,
      },
    });
  });
  it("does not turn a successful mutation into a retry when UI refresh fails", async () => {
    config.onWorkItemCreated = vi
      .fn()
      .mockRejectedValue(new Error("refresh unavailable"));
    expect(
      await execute("client_accounts", {
        action: "create",
        data: { name: "Acme" },
      }),
    ).toMatchObject({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("human control, failures and disclosure", () => {
  it("waits for the actual human confirmation before completing a project", async () => {
    let approve!: (value: boolean) => void;
    config.workflowContext!.confirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          approve = resolve;
        }),
    );
    const task = execute("project_lifecycle", {
      action: "update",
      projectId,
      data: { lifecycle: "completed" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    approve(true);
    expect(await task).toMatchObject({ status: "ok" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      lifecycle: "completed",
    });
  });
  it("does not write after cancellation, navigation, or an agent-supplied confirmation flag", async () => {
    config.workflowContext!.confirm = vi.fn(async () => false);
    expect(
      await execute("project_lifecycle", {
        action: "update",
        projectId,
        data: { lifecycle: "completed" },
      }),
    ).toMatchObject({ status: "not_applied" });
    expect(
      await execute("project_lifecycle", {
        action: "update",
        projectId,
        data: { lifecycle: "completed" },
        confirmed: true,
      }),
    ).toMatchObject({ status: "invalid_input" });
    config.workflowContext!.confirm = vi.fn(async () => {
      config.isActive = () => false;
      return true;
    });
    await expect(
      execute("project_lifecycle", {
        action: "update",
        projectId,
        data: { lifecycle: "completed" },
      }),
    ).rejects.toThrow(/old page/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never automatically retries a write after transport or server failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection reset"));
    expect(
      await execute("client_accounts", {
        action: "create",
        data: { name: "Acme" },
      }),
    ).toMatchObject({ status: "outcome_unknown" });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "internal_error" } }), {
        status: 500,
      }),
    );
    expect(
      await execute("client_accounts", {
        action: "create",
        data: { name: "Acme" },
      }),
    ).toMatchObject({ status: "outcome_unknown", http_status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("passes server denials through without implying success", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "forbidden", message: "Project lead access required" },
        }),
        { status: 403 },
      ),
    );
    expect(
      await execute("commercial_evidence", { action: "overview", projectId }),
    ).toMatchObject({
      status: "rejected",
      http_status: 403,
      error: { code: "forbidden" },
    });
    expect(config.onWorkItemCreated).not.toHaveBeenCalled();
  });
  it("keeps credential links and original file content out of bounded agent output", () => {
    const result = safeProjection({
      id: projectId,
      fragmentPath: "/client/invitations/accept#token=private",
      nested: {
        url: "https://app.test/accept?token=private",
        accessToken: "private",
        contentBase64: "private",
      },
      text: "x".repeat(100_000),
      items: Array(10000).fill({ title: "large".repeat(200) }),
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).toMatchObject({ truncated: true, secrets_omitted: true });
    expect(JSON.stringify(result).length).toBeLessThan(24000);
  });
  it("requires a save handler before sending a download request", async () => {
    config.workflowContext!.download = undefined;
    expect(
      await execute("workspace_exports", { action: "download_delivery_csv" }),
    ).toMatchObject({ status: "human_step_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("downloads binary data to the user without returning its bytes", async () => {
    fetchMock.mockResolvedValue(
      new Response("csv-data", {
        headers: {
          "content-disposition": 'attachment; filename="delivery.csv"',
        },
      }),
    );
    expect(
      await execute("workspace_exports", { action: "download_delivery_csv" }),
    ).toMatchObject({ status: "download_started", filename: "delivery.csv" });
    expect(config.workflowContext!.download).toHaveBeenCalledOnce();
  });
  it("hands private-link client invitations to the UI before creating a secret", async () => {
    fetchMock.mockResolvedValue(response({ id: projectId, key: "WEB" }));
    expect(
      await execute("client_participants", {
        action: "invite",
        projectId,
        data: { email: "client@example.test", role: "approver" },
      }),
    ).toMatchObject({
      status: "human_step_required",
      path: "/app/test-studio/projects/WEB/client",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/v1/workspaces/${workspaceId}/projects/${projectId}`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(config.workflowContext!.confirm).not.toHaveBeenCalled();
  });
  it("confirms explicit email invitations and omits the returned private link", async () => {
    fetchMock.mockResolvedValue(
      response({
        id: projectId,
        fragmentPath: "/client/invitations/accept#token=private",
      }),
    );
    const result = await execute("client_participants", {
      action: "invite",
      projectId,
      data: { email: "client@example.test", role: "approver", sendEmail: true },
    });
    expect(result).toMatchObject({ status: "ok", secrets_omitted: true });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(config.workflowContext!.confirm).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      sendEmail: true,
    });
  });
  it("opens the authorized engineering screen without starting provider consent", async () => {
    fetchMock.mockResolvedValue(response({ id: projectId, key: "WEB" }));
    expect(
      await execute("engineering_repositories", {
        action: "connect",
        projectId,
      }),
    ).toMatchObject({
      status: "human_step_required",
      path: "/app/test-studio/projects/WEB/engineering",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).not.toContain("/install");
  });
});
