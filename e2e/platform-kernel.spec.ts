import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";

import {
  expect,
  type APIRequestContext,
  type Page,
  test,
} from "@playwright/test";
import { Pool } from "pg";

const mailpitUrl = "http://127.0.0.1:8025";
let aiStub: Server;

test.beforeAll(async () => {
  aiStub = createServer((incoming, outgoing) => {
    let body = "";
    incoming.on("data", (chunk) => {
      body += String(chunk);
    });
    incoming.on("end", () => {
      const requestBody = JSON.parse(body) as {
        messages?: Array<{ content?: string }>;
      };
      const context = JSON.parse(
        requestBody.messages?.[1]?.content || "{}",
      ) as {
        kind?: string;
        facts?: Array<{ evidenceKey?: string }>;
      };
      const result = aiFixtureResult(
        context.kind,
        context.facts?.[0]?.evidenceKey,
      );
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(
        JSON.stringify({
          message: { role: "assistant", content: JSON.stringify(result) },
          prompt_eval_count: 120,
          eval_count: 48,
        }),
      );
    });
  });
  await new Promise<void>((resolve) =>
    aiStub.listen(3902, "127.0.0.1", resolve),
  );
  await withTestDatabase(async (pool) => {
    await pool.query("truncate table auth_rate_limits, action_rate_limits");
  });
});

test.afterAll(async () => {
  aiStub.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    aiStub.close((error) => (error ? reject(error) : resolve())),
  );
});

test("GA journey: verified account, workspace administration, export, and lifecycle intent", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const ownerEmail = `owner-${suffix}@example.test`;
  const memberEmail = `member-${suffix}@example.test`;
  const password = "test-password-123";

  await signUpAndVerify(page, request, ownerEmail, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Northstar Delivery");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Northstar Delivery" }),
  ).toBeVisible();
  await expect(page.getByText("Tenant boundary active")).toBeVisible();
  const workspacePath = new URL(page.url()).pathname;
  const workspaceSlug = workspacePath.split("/").at(-1)!;
  await page.getByRole("link", { name: "Continue setup" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Reach the first useful delivery state",
    }),
  ).toBeVisible();
  await expect(page.getByText(/1 of 4 core steps complete/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss checklist" }).click();
  await expect(page.getByRole("status")).toContainText("Checklist dismissed");
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("link", { name: "Continue setup" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Getting started" }).click();
  await page.getByRole("button", { name: "Resume checklist" }).click();
  await expect(page.getByRole("status")).toContainText("Checklist resumed");
  await page.goto(workspacePath);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Northstar Delivery" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/sign-in");
  await signIn(page, ownerEmail, password);
  await expect(
    page.getByRole("heading", { name: "Northstar Delivery" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Members" }).click();
  await page.getByLabel("Teammate email").fill(memberEmail);
  await page.getByRole("button", { name: "Invite teammate" }).click();
  await expect(page.getByText(/Invitation created/)).toBeVisible();
  await expect(page.getByLabel("One-time invitation link")).toHaveValue(
    /\/invitations\/accept#token=/,
  );

  const invitationUrl = await waitForEmailLink(
    request,
    memberEmail,
    "Join Northstar Delivery in ScopeDelta",
  );
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(invitationUrl);
  await expect(
    memberPage.getByText(/Sign in or create a verified account/),
  ).toBeVisible();
  await memberPage.getByRole("link", { name: "Create account" }).click();
  await fillSignUp(memberPage, memberEmail, password);
  await expect(memberPage.getByRole("status")).toContainText(
    /same message is shown/i,
  );
  const memberVerification = await waitForEmailLink(
    request,
    memberEmail,
    "Verify your ScopeDelta account",
  );
  await memberPage.goto(memberVerification);
  await memberPage.getByRole("link", { name: "Continue" }).click();
  await expect(
    memberPage.getByRole("heading", { name: "Northstar Delivery" }),
  ).toBeVisible();
  await expect(memberPage.getByText(/Authenticated workspace/)).toContainText(
    "member",
  );
  await page.reload();
  const memberRole = page.getByRole("combobox", {
    name: "Role for Member Test",
  });
  await expect(memberRole).toBeVisible();
  await memberRole.selectOption("admin");
  await expect(memberRole).toHaveValue("admin");
  await page.getByRole("button", { name: "Suspend access" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Workspace access suspended",
  );
  const suspendedResponse = await memberPage.goto(
    `${workspacePath}/settings/members`,
  );
  expect(suspendedResponse?.status()).toBe(404);
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Workspace access reactivated",
  );
  await memberPage.goto(workspacePath);
  await expect(
    memberPage.getByRole("heading", { name: "Northstar Delivery" }),
  ).toBeVisible();
  await memberContext.close();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Create comprehensive export" })
    .click();
  await expect(page.getByText(/Export ready until/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download part 1/ }).click();
  await expect((await download).suggestedFilename()).toMatch(
    /^scopedelta-.*-part-1\.tar\.gz$/,
  );
  await page
    .getByLabel(/Type the workspace slug to confirm/)
    .fill(workspaceSlug);
  await page.getByLabel(/reviewed the available export path/).check();
  await page.getByLabel(/records remain/).check();
  await page.getByRole("button", { name: "Record lifecycle request" }).click();
  const lifecycleRegion = page.getByRole("region", {
    name: "Request closure or deletion",
  });
  await expect(lifecycleRegion.getByRole("status")).toContainText(
    "No workspace data was deleted",
  );
  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-012-export-lifecycle-desktop.png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(lifecycleRegion.getByRole("status")).toContainText(
    "Lifecycle request canceled",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    (await page.getByRole("link", { name: "Overview" }).getAttribute("href"))!,
  );
  await expect(page.getByText("Tenant boundary active")).toBeVisible();
  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await page
      .locator("nextjs-portal")
      .evaluateAll((elements) =>
        elements.forEach((element) => element.remove()),
      );
    await page.screenshot({
      path: "docs/screenshots/sc-004-shell-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.locator("body *").evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().right > 390.5)
        .map((element) => ({
          element: element.tagName,
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .slice(0, 20),
    );
    expect(overflow).toEqual([]);
    await page.screenshot({
      path: "docs/screenshots/sc-004-shell-mobile.png",
      fullPage: true,
    });
  }
});

test("password recovery uses a generic request response and revokes the old password", async ({
  page,
  request,
}) => {
  const email = `recovery-${Date.now()}@example.test`;
  const oldPassword = "test-password-123";
  const newPassword = "new-test-password-456";
  await signUpAndVerify(page, request, email, oldPassword, "/onboarding");
  await page.goto("/forgot-password");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();

  const resetUrl = await waitForEmailLink(
    request,
    email,
    "Reset your ScopeDelta password",
  );
  await page.goto(resetUrl);
  await page.getByLabel(/^New password/).fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();
  await page.waitForURL("**/sign-in");
  await page.goto("/onboarding");
  await page.waitForURL(/\/sign-in/);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(oldPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("The email or password was not accepted."),
  ).toBeVisible();
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/onboarding$/);
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("client project, milestone, and backlog work through the production UI", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `delivery-${suffix}@example.test`;
  const password = "test-password-123";
  await signUpAndVerify(page, request, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Atlas Delivery");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Acme Labs");
  await page.getByLabel("Internal reference").fill("ACME");
  await page.getByLabel("Summary").fill("Primary delivery account");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("status")).toHaveText("Client created.");
  await expect(page.getByText("Acme Labs", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("ACME");
  await page.getByLabel("Project name").fill("Customer portal rebuild");
  await page.getByLabel("Target date").fill("2026-12-18");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toHaveText("Project created.");
  await page.getByRole("link", { name: /Customer portal rebuild/ }).click();

  await expect(
    page.getByRole("region", { name: "Project context" }),
  ).toContainText("Acme Labs");
  await expect(
    page.getByRole("heading", { name: "Needs attention" }),
  ).toBeVisible();
  await expect(page.getByText("No active or planned cycle")).toBeVisible();
  await expect(page.getByText("No unfinished milestone")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delivery drift" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await openProjectMore(page);
  await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByText("New milestone").click();
  const milestoneForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create milestone" }),
  });
  await milestoneForm.getByLabel("Name").fill("Private beta");
  await milestoneForm.getByLabel("Target date").fill("2026-11-20");
  await milestoneForm.getByRole("button", { name: "Create milestone" }).click();
  await expect(page.getByRole("status")).toHaveText("Milestone created.");
  await page.getByRole("link", { name: "Backlog", exact: true }).click();

  await page.getByText("New work item").click();
  const createForm = page.locator("form.work-form").filter({
    has: page.getByRole("button", { name: "Create work item" }),
  });
  await createForm.getByLabel("Title").fill("Implement secure account shell");
  await createForm.getByLabel("Status").selectOption("ready");
  await createForm.getByLabel("Priority").selectOption("high");
  await createForm.getByLabel("Assignee").selectOption({ index: 1 });
  await createForm
    .getByLabel("Milestone")
    .selectOption({ label: "Private beta" });
  await createForm
    .getByLabel("Acceptance criteria")
    .fill("Only authorized project members can open the shell.");
  await createForm.getByRole("button", { name: "Create work item" }).click();
  await expect(page.getByRole("status")).toHaveText("Work item created.");
  await expect(page.getByText("ACME-1", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: /Implement secure account shell/ })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit work item" });
  await editor.getByLabel("Status").selectOption("in_progress");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Work item updated.");
  await expect(
    page.getByRole("heading", { name: "In progress" }),
  ).toBeVisible();

  await openProjectMore(page);
  await page.getByRole("link", { name: "Cycles" }).click();
  await expect(
    page.getByRole("heading", { name: "No open cycles" }),
  ).toBeVisible();
  await page.getByText("New cycle").click();
  await page.getByLabel("Cycle name").fill("August delivery");
  await page.getByLabel("Start date").fill("2026-08-10");
  await page.getByLabel("End date").fill("2026-08-21");
  await page
    .getByLabel("Goal / summary")
    .fill("Complete the secure account shell");
  await page.getByRole("button", { name: "Create cycle" }).click();
  await expect(page.getByRole("status")).toHaveText("Cycle created.");
  await expect(page.getByText("Cycle 1", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Board" }).click();
  const card = page.locator("article.kanban-card").filter({
    hasText: "Implement secure account shell",
  });
  await expect(card).toBeVisible();
  await card.getByLabel("Cycle").selectOption({ label: "August delivery" });
  await card.getByRole("button", { name: "Plan" }).click();
  await expect(page.getByRole("status")).toHaveText("Cycle plan updated.");
  await page.reload();
  const plannedCard = page.locator("article.kanban-card").filter({
    hasText: "Implement secure account shell",
  });
  await expect(
    plannedCard.locator(".kanban-card-context").getByText("August delivery"),
  ).toBeVisible();
  const boardEditorOpener = plannedCard.getByRole("button", {
    name: /Implement secure account shell/,
  });
  await boardEditorOpener.click();
  const boardEditor = page.getByRole("dialog", { name: "Edit work item" });
  const closeEditor = boardEditor.getByRole("button", { name: "Close" });
  const saveChanges = boardEditor.getByRole("button", {
    name: "Save changes",
  });
  await expect(closeEditor).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(saveChanges).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeEditor).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(boardEditor).toBeHidden();
  await expect(boardEditorOpener).toBeFocused();
  await plannedCard.getByRole("button", { name: "In review →" }).click();
  await expect(page.getByRole("status")).toHaveText("Moved to In review.");

  await page.getByRole("link", { name: "My work", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Implement secure account shell/ }),
  ).toBeVisible();
  await expect(
    page.getByText("August delivery", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search my work").fill("secure account");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/query=secure\+account/);
  await expect(
    page.getByRole("link", { name: /Implement secure account shell/ }),
  ).toBeVisible();

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
    await page.goto(`/app/${workspaceSlug}/projects/ACME/board`);
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005b-board-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/app/${workspaceSlug}/projects/ACME/board?status=in_review`,
    );
    await removeDevIndicator(page);
    await page.screenshot({
      path: "docs/screenshots/sc-005b-board-mobile.png",
      fullPage: true,
    });
    await page.goto(`/app/${workspaceSlug}/my-work`);
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005b-my-work-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-005b-my-work-mobile.png",
      fullPage: true,
    });
    await page.goto(`/app/${workspaceSlug}/projects/ACME/cycles`);
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005b-cycles-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-005b-cycles-mobile.png",
      fullPage: true,
    });
  }

  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
  await seedPlanningVolume(email);
  await page.goto(`/app/${workspaceSlug}/my-work?page=2`);
  await expect(page.locator("article.my-work-row")).toHaveCount(50);
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await seedDirectoryVolume(email);
  await page.goto(`/app/${workspaceSlug}/clients?page=3`);
  await expect(
    page.getByText("Bulk client 105", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Page 3 · 106 clients")).toBeVisible();

  await page.goto(`/app/${workspaceSlug}/projects?page=3&clientPage=3`);
  await expect(
    page.getByRole("link", { name: /Bulk project 105/ }),
  ).toBeVisible();
  await page.goto(`/app/${workspaceSlug}/projects?query=Bulk+project+105`);
  await expect(page).toHaveURL(/query=Bulk\+project\+105/);
  await expect(
    page.getByRole("link", { name: /Bulk project 105/ }),
  ).toBeVisible();
  await page.goto(`/app/${workspaceSlug}/projects?page=3&clientPage=3`);
  await page.getByText("New project").click();
  await expect(
    page.getByRole("option", { name: "Bulk client 105" }),
  ).toBeAttached();
});

test("authenticated workspace exposes existing workflows through four WebMCP tools", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    type InjectedTool = {
      name: string;
      execute: (
        input: Record<string, unknown>,
        options: { signal: AbortSignal },
      ) => Promise<unknown>;
    };
    const tools = new Map<string, InjectedTool>();
    const browserWindow = window as typeof window & {
      __webMcpTools?: Map<string, InjectedTool>;
    };
    browserWindow.__webMcpTools = tools;
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (
          tool: InjectedTool,
          options?: { signal?: AbortSignal },
        ) => {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener(
            "abort",
            () => {
              if (tools.get(tool.name) === tool) tools.delete(tool.name);
            },
            { once: true },
          );
        },
        getTools: async () => [...tools.values()],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `webmcp-${suffix}@example.test`;
  const password = "test-password-123";
  await signUpAndVerifyLocally(page, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("WebMCP Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Browser Tools Client");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("status")).toHaveText("Client created.");

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("WEB");
  await page.getByLabel("Project name").fill("Browser tool delivery");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toHaveText("Project created.");
  await page.getByRole("link", { name: /Browser tool delivery/ }).click();
  await page.getByRole("link", { name: "Backlog", exact: true }).click();

  await expect(page.getByText("4 browser tools active")).toBeVisible();
  await expect(page.locator(".webmcp-tool-names")).toHaveText(
    "list_my_work, search_work_items, get_commercial_drift, create_work_item",
  );

  const readResults = await page.evaluate(async () => {
    const tools = (
      window as typeof window & {
        __webMcpTools: Map<
          string,
          {
            execute: (
              input: Record<string, unknown>,
              options: { signal: AbortSignal },
            ) => Promise<unknown>;
          }
        >;
      }
    ).__webMcpTools;
    const execute = (name: string, input: Record<string, unknown>) =>
      tools.get(name)!.execute(input, {
        signal: new AbortController().signal,
      });
    return Promise.all([
      execute("list_my_work", { limit: 10 }),
      execute("search_work_items", {
        project_key: "WEB",
        query: "agent-created",
      }),
      execute("get_commercial_drift", { project_key: "WEB", limit: 5 }),
    ]);
  });
  expect(readResults).toHaveLength(3);

  const created = await page.evaluate(async () => {
    const tool = (
      window as typeof window & {
        __webMcpTools: Map<
          string,
          {
            execute: (
              input: Record<string, unknown>,
              options: { signal: AbortSignal },
            ) => Promise<unknown>;
          }
        >;
      }
    ).__webMcpTools.get("create_work_item")!;
    return tool.execute(
      {
        project_key: "WEB",
        title: "Agent-created delivery checkpoint",
        status: "ready",
        priority: "high",
        assign_to_me: true,
      },
      { signal: new AbortController().signal },
    );
  });
  expect(created).toMatchObject({
    identifier: "WEB-1",
    project_key: "WEB",
    ui_refresh_requested: true,
  });

  await expect(
    page.getByText("Agent-created delivery checkpoint", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Project context" })
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Agent-created delivery checkpoint/ }),
  ).toBeVisible();
  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/hack-002-command-center.png",
      fullPage: true,
    });
  }
  await page.getByRole("link", { name: "Backlog", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Backlog", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Agent-created delivery checkpoint", { exact: true }),
  ).toBeVisible();
  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/webmcp-browser-tools.png",
      fullPage: true,
    });
    await page.screenshot({
      path: "docs/screenshots/hack-002-created-work.png",
      fullPage: true,
    });
  }
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "My work", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Agent-created delivery checkpoint/ }),
  ).toBeVisible();
  const signOutButton = page.getByRole("button", { name: "Sign out" });
  await expect(signOutButton).toBeInViewport();
  await expect(signOutButton).toBeEnabled();
});

test("owner operates portfolio capacity and work-item time from the UI", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `operations-${suffix}@example.test`;
  const password = "test-password-123";
  const today = new Date().toISOString().slice(0, 10);
  const monday = isoMonday(today);
  const yesterday = isoDateOffset(today, -1);

  await signUpAndVerifyLocally(page, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Operations Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Northwind");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("status")).toHaveText("Client created.");

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("OPS");
  await page.getByLabel("Project name").fill("Operations rollout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toHaveText("Project created.");
  await page.getByRole("link", { name: /Operations rollout/ }).click();

  await page.getByText("New milestone").click();
  const milestoneForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create milestone" }),
  });
  await milestoneForm.getByLabel("Name").fill("Overdue client review");
  await milestoneForm.getByLabel("Target date").fill(yesterday);
  await milestoneForm.getByRole("button", { name: "Create milestone" }).click();
  await expect(page.getByRole("status")).toHaveText("Milestone created.");

  await page.getByRole("link", { name: "Backlog" }).click();
  await page.getByText("New work item").click();
  const workForm = page.locator("form.work-form").filter({
    has: page.getByRole("button", { name: "Create work item" }),
  });
  await workForm.getByLabel("Title").fill("Prepare operations handoff");
  await workForm.getByLabel("Status").selectOption("ready");
  await workForm.getByLabel("Assignee").selectOption({ index: 1 });
  await workForm.getByRole("button", { name: "Create work item" }).click();
  await expect(page.getByRole("status")).toHaveText("Work item created.");

  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  const overdue = page.getByRole("link", { name: /Overdue target/ });
  await expect(overdue).toBeVisible();
  await expect(overdue).toHaveAttribute("href", /projects\/OPS#milestones$/);

  await page.getByRole("link", { name: "Capacity", exact: true }).click();
  await page.getByText("Schedule availability").click();
  const availabilityForm = page.locator("form.operations-mutation.compact");
  await availabilityForm.getByLabel("Minutes / week").fill("1200");
  await availabilityForm.getByLabel("Effective Monday").fill(monday);
  await availabilityForm
    .getByRole("button", { name: "Set availability" })
    .click();
  await expect(availabilityForm.getByRole("status")).toContainText(
    "Availability scheduled",
  );

  await page.getByText("Add planned allocation").click();
  const allocationForm = page.locator("form.operations-mutation").filter({
    has: page.getByRole("button", { name: "Add allocation" }),
  });
  await allocationForm.getByLabel("Start Monday").fill(monday);
  await allocationForm.getByLabel("End Monday").fill(monday);
  await allocationForm.getByLabel("Minutes / week").fill("1800");
  await allocationForm.getByRole("button", { name: "Add allocation" }).click();
  await expect(allocationForm.getByRole("status")).toContainText(
    "Allocation added",
  );
  await expect(
    page.locator("details.capacity-week.is-over").first(),
  ).toContainText("10h");

  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByRole("link", { name: /Prepare operations handoff/ }).click();
  await page.getByText("Log time against this work item").click();
  const quickTime = page.locator("form.operations-mutation").filter({
    has: page.getByRole("button", { name: "Log time" }),
  });
  await quickTime.getByLabel("Work date").fill(today);
  await quickTime.getByLabel("Actual minutes").fill("30");
  await quickTime.getByLabel("Note").fill("Handoff review");
  await quickTime.getByRole("button", { name: "Log time" }).click();
  await expect(quickTime.getByRole("status")).toContainText("Logged");

  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await page.getByRole("link", { name: "Time", exact: true }).click();
  await expect(page.getByText("Handoff review")).toBeVisible();
  await expect(page.getByText("30m").first()).toBeVisible();

  await page.goto(
    new URL(page.url()).pathname.replace(
      /\/operations\/time$/,
      "/projects/OPS/commercial",
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Current authoritative position" }),
  ).toBeVisible();
  await expect(
    page.getByText("No baseline money or margin inferred"),
  ).toBeVisible();
});

test("project lead sees unrelated capacity as other committed work", async ({
  page,
  browser,
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const ownerEmail = `capacity-owner-${suffix}@example.test`;
  const leadEmail = `capacity-lead-${suffix}@example.test`;
  const workerEmail = `capacity-worker-${suffix}@example.test`;
  const password = "test-password-123";
  const monday = isoMonday(new Date().toISOString().slice(0, 10));

  await signUpAndVerifyLocally(page, ownerEmail, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Masked Capacity Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/app\//);
  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;

  const leadContext = await browser.newContext();
  const leadPage = await leadContext.newPage();
  await signUpAndVerifyLocally(leadPage, leadEmail, password, "/onboarding");

  await withTestDatabase(async (pool) => {
    const workspace = await pool.query<{ id: string }>(
      "select id from workspaces where slug = $1",
      [workspaceSlug],
    );
    const owner = await pool.query<{ id: string }>(
      "select id from users where email = $1",
      [ownerEmail],
    );
    const lead = await pool.query<{ id: string }>(
      "select id from users where email = $1",
      [leadEmail],
    );
    const workerId = randomUUID();
    const clientId = randomUUID();
    const ledProjectId = randomUUID();
    const privateProjectId = randomUUID();
    const workspaceId = workspace.rows[0]!.id;
    const ownerId = owner.rows[0]!.id;
    const leadId = lead.rows[0]!.id;
    await pool.query(
      "insert into users (id, email, name, email_verified) values ($1, $2, 'Capacity Worker', true)",
      [workerId, workerEmail],
    );
    await pool.query(
      `insert into memberships (id, workspace_id, user_id, role) values
       (gen_random_uuid(), $1, $2, 'member'),
       (gen_random_uuid(), $1, $3, 'member')`,
      [workspaceId, leadId, workerId],
    );
    await pool.query(
      "insert into clients (id, workspace_id, name) values ($1, $2, 'Capacity Client')",
      [clientId, workspaceId],
    );
    await pool.query(
      `insert into projects (id, workspace_id, client_id, key, name, lead_user_id) values
       ($1, $3, $4, 'VISIBLE', 'Visible delivery', $5),
       ($2, $3, $4, 'PRIVATE', 'Confidential account', $6)`,
      [ledProjectId, privateProjectId, workspaceId, clientId, leadId, ownerId],
    );
    await pool.query(
      `insert into project_memberships (project_id, workspace_id, user_id, added_by_user_id) values
       ($1, $2, $3, $4), ($1, $2, $5, $4)`,
      [ledProjectId, workspaceId, leadId, ownerId, workerId],
    );
    await pool.query(
      `insert into project_allocations (
         id, workspace_id, project_id, member_user_id, start_week, end_week,
         planned_minutes_per_week, role_label, created_by_user_id, updated_by_user_id
       ) values
       (gen_random_uuid(), $1, $2, $3, $4, $4, 1200, 'Delivery', $5, $5),
       (gen_random_uuid(), $1, $6, $3, $4, $4, 1500, 'Confidential role', $5, $5)`,
      [workspaceId, ledProjectId, workerId, monday, ownerId, privateProjectId],
    );
  });

  await leadPage.goto(
    `/app/${workspaceSlug}/operations/capacity?startWeek=${monday}&weeks=1`,
  );
  await expect(
    leadPage.getByRole("heading", { name: "Capacity", exact: true }),
  ).toBeVisible();
  await leadPage
    .locator("article.capacity-person")
    .filter({ hasText: "Capacity Worker" })
    .locator("summary")
    .click();
  await expect(
    leadPage.getByText("Visible delivery", { exact: true }),
  ).toBeVisible();
  await expect(
    leadPage.getByText("Other committed work", { exact: true }),
  ).toBeVisible();
  await expect(leadPage.getByText("Confidential account")).toHaveCount(0);
  await expect(leadPage.getByText("Confidential role")).toHaveCount(0);
  await leadContext.close();
});

test("admin applies a template, previews Jira CSV, imports safely, and exports core delivery", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const ownerEmail = `adoption-owner-${suffix}@example.test`;
  const outsiderEmail = `adoption-outsider-${suffix}@example.test`;
  const password = "test-password-123";

  await signUpAndVerifyLocally(page, ownerEmail, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Adoption Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Migration Client");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("status")).toHaveText("Client created.");

  await page.getByRole("link", { name: "Adoption", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Standards, migration, and portability",
    }),
  ).toBeVisible();
  await page.getByText("New project template").click();
  const templateForm = page.locator("form.adoption-form").filter({
    has: page.getByRole("button", { name: "Create template" }),
  });
  await templateForm.getByLabel("Template name").fill("Delivery launch");
  await templateForm
    .getByLabel("Default project context")
    .fill("A copied delivery launch standard.");
  await templateForm
    .getByLabel(/Milestones/)
    .fill("release | Release ready | 30");
  await templateForm.getByLabel(/Cycles/).fill("cycle-1 | Cycle 1 | 0 | 14");
  await templateForm
    .getByLabel(/Work items/)
    .fill(
      "launch | | Prepare delivery launch | Launch evidence is accepted | release | cycle-1 | delivery",
    );
  await templateForm.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByText(/Template created/)).toBeVisible();

  const template = page.locator("details.adoption-template").filter({
    hasText: "Delivery launch",
  });
  await template.locator(":scope > summary").click();
  const applyForm = template.locator("form.adoption-form").filter({
    has: page.getByRole("button", { name: "Apply v1" }),
  });
  await applyForm.getByLabel("Project key").fill("TPL");
  await applyForm.getByLabel("Project name").fill("Template project");
  await applyForm.getByLabel("Start date").fill("2026-09-07");
  await applyForm.getByRole("button", { name: "Apply v1" }).click();
  await page.waitForURL(/\/projects\/TPL$/);
  await expect(page.getByText("Release ready", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Backlog" }).click();
  await expect(
    page.getByRole("button", { name: /TPL-1 Prepare delivery launch/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Adoption", exact: true }).click();
  const importForm = page.locator("form.adoption-form").filter({
    has: page.getByRole("button", { name: "Create dry-run preview" }),
  });
  await importForm.getByLabel("Source namespace").fill("jira-browser");
  await importForm.getByLabel("Source label").fill("Jira browser fixture");
  await importForm
    .getByLabel("CSV file")
    .setInputFiles("fixtures/migration/jira-active-project.csv");
  await importForm
    .getByRole("button", { name: "Create dry-run preview" })
    .click();
  await expect(page.getByText(/Preview saved/)).toBeVisible();
  await expect(page.getByText("Custom contract note")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Keep unresolved" }).first(),
  ).toBeAttached();
  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-011b-adoption-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-011b-adoption-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page
    .getByRole("button", {
      name: "Confirm import and skip existing source objects",
    })
    .click();
  await expect(page.getByText("Import completed.")).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = await readFile(downloadPath!, "utf8");
  expect(csv).toContain("core_delivery_not_legal_audit");
  expect(csv).toContain("WEB-1");
  expect(csv).toContain("jira-browser");

  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  await signUpAndVerifyLocally(
    outsiderPage,
    outsiderEmail,
    password,
    "/onboarding",
  );
  const denied = await outsiderPage.goto(
    `/app/${workspaceSlug}/settings/adoption`,
  );
  expect(denied?.status()).toBe(404);
  await expect(outsiderPage.getByText(/could not be found/i)).toBeVisible();
  await outsiderContext.close();
});

test("commercial baseline, decision authorization and contradictions stay traceable", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `commercial-${suffix}@example.test`;
  const password = "test-password-123";
  const commercialText =
    "Deliver an authenticated client portal with tenant-safe project access.";

  await signUpAndVerify(page, request, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Commercial Delivery");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Acme Commercial");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("SCOPE");
  await page.getByLabel("Project name").fill("Evidence-backed delivery");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name: /Evidence-backed delivery/ }).click();
  await page.getByRole("link", { name: "Backlog" }).click();
  await page.getByText("New work item").click();
  const workForm = page.locator("form.work-form").filter({
    has: page.getByRole("button", { name: "Create work item" }),
  });
  await workForm.getByLabel("Title").fill("Build authenticated portal");
  await workForm.getByLabel("Status").selectOption("in_progress");
  await workForm.getByRole("button", { name: "Create work item" }).click();
  await expect(page.getByRole("status")).toHaveText("Work item created.");

  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/commercial`);
  await expect(
    page.getByRole("heading", { name: "Commercial", exact: true }),
  ).toBeVisible();
  await page.getByText("Add commercial source").click();
  const sourceForm = page.locator("form.commercial-source-form");
  await sourceForm.getByLabel("Source name").fill("Signed SOW extract");
  await sourceForm.getByLabel("Commercial text").fill(commercialText);
  await sourceForm.getByRole("button", { name: "Preserve source" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commercial source preserved and parsed.",
  );
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  await page.getByLabel("Ready source").selectOption({
    label: "Signed SOW extract",
  });
  await page.getByRole("button", { name: "Create baseline v1" }).click();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  const evidence = page.locator("textarea.source-text-inspector");
  await expect(evidence).toHaveValue(commercialText);
  await evidence.press("ControlOrMeta+A");
  await expect(page.locator(".selected-evidence blockquote")).toHaveText(
    commercialText,
  );
  const scopeItemForm = page.locator("form.scope-item-form");
  await scopeItemForm
    .getByLabel("Scope item")
    .fill("Authenticated client portal");
  await scopeItemForm
    .getByLabel("Evidence label")
    .fill("Deliverable paragraph");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/commercial/scope-items") &&
        response.ok(),
    ),
    scopeItemForm.getByRole("button", { name: "Add scope item" }).click(),
  ]);
  await expect(page.getByRole("status")).toHaveText(
    "Scope item added to the baseline.",
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByText("Authenticated client portal", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make version effective" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Baseline version is now effective.",
  );
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();

  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/backlog`);
  await expect(
    page.getByText("Needs classification", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Build authenticated portal/ })
    .click();
  await page
    .getByRole("link", { name: "Open discussion and activity" })
    .click();
  await expect(page.getByRole("heading", { name: "Classify" })).toBeVisible();
  await page.getByLabel("Work purpose").selectOption("client_delivery");
  await page.getByRole("button", { name: "Update classification" }).click();
  await expect(page.getByRole("heading", { name: "Unlinked" })).toBeVisible();
  await page.getByLabel("Commercial basis").selectOption({
    label: "deliverable · Authenticated client portal",
  });
  await page.getByRole("button", { name: "Link commercial basis" }).click();
  await expect(page.getByRole("heading", { name: "Linked" })).toBeVisible();
  await expect(
    page.getByText("Authenticated client portal", { exact: true }),
  ).toBeVisible();

  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/commercial`);
  const statusStrip = page.locator(".commercial-status-strip");
  await expect(statusStrip.getByText("1", { exact: true })).toHaveCount(1);
  await expect(statusStrip.getByText("Baseline linked")).toBeVisible();

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-006a-commercial-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-006a-commercial-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  const amendmentText =
    "The authenticated client portal now includes enterprise SSO.";
  await page.getByText("Add commercial source").click();
  await sourceForm.getByLabel("Source name").fill("Signed SSO amendment");
  await sourceForm.getByLabel("Commercial text").fill(amendmentText);
  await sourceForm.getByRole("button", { name: "Preserve source" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commercial source preserved and parsed.",
  );
  await page.getByLabel("Amendment label").fill("Enterprise SSO amendment");
  await page.getByLabel("Amendment source").selectOption({
    label: "Signed SSO amendment",
  });
  const prepareAmendment = page.getByRole("button", {
    name: "Prepare amendment draft",
  });
  await expect(prepareAmendment).toBeEnabled();
  await prepareAmendment.click();
  await expect(
    page.getByText("carried forward", { exact: true }).first(),
  ).toBeVisible();
  const carriedScope = page.locator(".scope-ledger article").filter({
    hasText: "Authenticated client portal",
  });
  await carriedScope.getByRole("button", { name: "Revise" }).click();
  const amendmentSourceRow = page
    .locator(".commercial-source-list article")
    .filter({
      hasText: "Signed SSO amendment",
    });
  await amendmentSourceRow.getByRole("button", { name: "Inspect" }).click();
  await expect(evidence).toHaveValue(amendmentText);
  await evidence.press("ControlOrMeta+A");
  await scopeItemForm
    .getByLabel("Scope item")
    .fill("Authenticated client portal with enterprise SSO");
  await scopeItemForm
    .getByRole("button", { name: "Preserve revision" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Scope revision preserved.",
  );
  await page.getByRole("button", { name: "Make version effective" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Baseline version is now effective.",
  );
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/backlog`);
  await page
    .getByRole("button", { name: /Build authenticated portal/ })
    .click();
  await page
    .getByRole("link", { name: "Open discussion and activity" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Stale basis" }),
  ).toBeVisible();
  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/commercial`);
  await expect(page.getByText("SSO and launch amendment")).toHaveCount(0);
  await expect(page.getByText("Enterprise SSO amendment")).toBeVisible();

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-006c-amendment-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-006c-amendment-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await page.getByText("Record a client request").click();
  const requestForm = page.locator("form.commercial-change-form").filter({
    has: page.getByRole("button", { name: "Record request" }),
  });
  await requestForm.getByLabel("Request title").fill("Add production export");
  await requestForm
    .getByLabel("Original language or concise description")
    .fill("Client asked us to add a production export workflow.");
  await requestForm
    .getByLabel("Client/requester label (optional)")
    .fill("Product sponsor");
  await requestForm
    .getByRole("group", { name: "Potentially affected baseline scope" })
    .getByLabel(/Authenticated client portal/)
    .check();
  await requestForm.getByLabel("Source").selectOption({
    label: "Signed SOW extract",
  });
  await requestForm.getByLabel("Start offset").fill("0");
  await requestForm
    .getByLabel("End offset")
    .fill(String(commercialText.length));
  await requestForm.getByLabel("Exact amount").fill("1250.50");
  await requestForm.getByLabel("Currency").fill("USD");
  await requestForm.getByRole("button", { name: "Record request" }).click();
  await expect(page.getByRole("status")).toHaveText("Client request recorded.");

  let requestCard = page.locator("article.commercial-request-card").filter({
    hasText: "Add production export",
  });
  await expect(requestCard).toContainText("open");
  await requestCard
    .locator("summary")
    .filter({ hasText: "Confirm decision" })
    .click();
  let decisionForm = requestCard.locator("form.commercial-change-form").filter({
    has: page.getByRole("button", { name: "Confirm decision" }),
  });
  await decisionForm.getByLabel("Disposition").selectOption("paid_change");
  await decisionForm
    .getByLabel("Decision rationale")
    .fill("Client authorized the incremental delivery work.");
  await decisionForm
    .getByRole("group", { name: "Affected baseline scope" })
    .getByLabel(/Authenticated client portal/)
    .check();
  await decisionForm.getByLabel("Confidence").selectOption("confirmed");
  await decisionForm.getByLabel("Effort hours").fill("12");
  await decisionForm.getByLabel("Exact amount").fill("1200.00");
  await decisionForm.getByLabel("Currency").fill("USD");
  await decisionForm.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commercial decision confirmed.",
  );
  requestCard = page.locator("article.commercial-request-card").filter({
    hasText: "Add production export",
  });
  await expect(requestCard).toContainText("paid change");
  await expect(requestCard).toContainText("confirmed: 12.00h · USD 1200.00");

  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/backlog`);
  await page
    .getByRole("button", { name: /Build authenticated portal/ })
    .click();
  await page
    .getByRole("link", { name: "Open discussion and activity" })
    .click();
  await page.waitForURL(/\/work\//);
  const workUrl = page.url();
  await page.getByLabel("Commercial basis").selectOption({
    label: "paid change · Add production export",
  });
  await page.getByRole("button", { name: "Link commercial basis" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commercial provenance linked.",
  );
  await expect(
    page.getByText("Add production export", { exact: true }),
  ).toBeVisible();
  const baselineLink = page.locator(".work-commercial-links > div").filter({
    hasText: "Authenticated client portal",
  });
  await baselineLink.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commercial basis removed.",
  );
  await expect(baselineLink).toBeHidden();
  await expect(page.getByRole("heading", { name: "Linked" })).toBeVisible();

  await page.goto(`/app/${workspaceSlug}/projects/SCOPE/commercial`);
  requestCard = page.locator("article.commercial-request-card").filter({
    hasText: "Add production export",
  });
  await requestCard
    .locator("summary")
    .filter({ hasText: "Correct/supersede decision" })
    .click();
  decisionForm = requestCard.locator("form.commercial-change-form").filter({
    has: page.getByRole("button", { name: "Supersede decision" }),
  });
  await decisionForm.getByLabel("Disposition").selectOption("rejected");
  await decisionForm
    .getByLabel("Decision rationale")
    .fill("Client withdrew authorization after delivery started.");
  await decisionForm
    .getByRole("button", { name: "Supersede decision" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Commercial decision superseded. Linked active work may require review.",
  );
  requestCard = page.locator("article.commercial-request-card").filter({
    hasText: "Add production export",
  });
  await expect(requestCard).toContainText("1 work contradiction");
  await expect(requestCard).toContainText("Build authenticated portal");
  await expect(requestCard.getByLabel("Disposition")).toHaveValue("rejected");
  await requestCard.getByText("Prior decisions (1)").click();
  await expect(
    requestCard
      .locator(".commercial-decision-history")
      .getByText("paid change"),
  ).toBeVisible();

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: "docs/screenshots/sc-006b-commercial-decision-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-006b-commercial-decision-mobile.png",
      fullPage: true,
    });
  }

  const refreshedWorkUrl = new URL(workUrl);
  refreshedWorkUrl.searchParams.set("commercialRevision", String(Date.now()));
  await page.goto(refreshedWorkUrl.toString(), { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Unlinked" })).toBeVisible();
  await expect(page.getByText(/superseded · review required/)).toBeVisible();
});

test("project brief, work discussion, activity, and inbox are accessible and bounded", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `collaboration-${suffix}@example.test`;
  const password = "test-password-123";
  await signUpAndVerify(page, request, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Team Context");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Collaboration client");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("status")).toHaveText("Client created.");

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("TEAM");
  await page.getByLabel("Project name").fill("Contextual delivery");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name: /Contextual delivery/ }).click();
  await page.getByRole("link", { name: "Backlog" }).click();
  await page.getByText("New work item").click();
  const createForm = page.locator("form.work-form").filter({
    has: page.getByRole("button", { name: "Create work item" }),
  });
  await createForm.getByLabel("Title").fill("Confirm handoff context");
  await createForm.getByLabel("Status").selectOption("in_progress");
  await createForm.getByRole("button", { name: "Create work item" }).click();
  await expect(page.getByRole("status")).toHaveText("Work item created.");
  await page.getByRole("button", { name: /Confirm handoff context/ }).click();
  const editor = page.getByRole("dialog", { name: "Edit work item" });
  await editor
    .getByRole("link", { name: "Open discussion and activity" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Confirm handoff context" }),
  ).toBeVisible();
  await page
    .getByLabel("Add a comment")
    .fill("The handoff decision is ready for review.");
  await page.getByLabel("Mention").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Insert mention" }).click();
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByText(/handoff decision is ready/)).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Edit comment")
    .fill("The handoff decision is ready for final review.");
  await page.getByRole("button", { name: "Save edit" }).click();
  await expect(page.getByText(/ready for final review/)).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByText("Version 1")).toBeVisible();
  await page.getByRole("button", { name: "Hide history" }).click();
  await page.getByRole("button", { name: "Reply" }).click();
  await page.getByLabel("Reply").fill("Acknowledged and captured.");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByText("Acknowledged and captured.")).toBeVisible();
  await page.getByRole("button", { name: "Watching" }).click();
  await expect(
    page.getByRole("button", { name: "Watch", exact: true }),
  ).toBeVisible();
  await expectBasicAccessibility(page);

  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
  const workItemId = await workItemIdFor(email, "TEAM");
  await seedCollaborationVolume(email, "TEAM");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "107 comments" }),
  ).toBeVisible();
  await expect(
    page.getByText("Parent context from another page"),
  ).toBeVisible();
  await expect(page.getByText("Acknowledged and captured.")).toBeVisible();
  await page.getByRole("button", { name: "Search members" }).click();
  await expect(page.getByText("106 matching project members.")).toBeVisible();
  await page.getByRole("button", { name: "Next matches" }).click();
  await page.getByRole("button", { name: "Next matches" }).click();
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await page.getByLabel("Mention").selectOption({ label: "Volume member 105" });
  await page
    .getByLabel("Add a comment")
    .fill("High-volume collaboration remains reachable.");
  await page.getByRole("button", { name: "Insert mention" }).click();
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(
    page.getByText(/High-volume collaboration remains reachable/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/High-volume collaboration remains reachable/),
  ).toBeVisible();
  const discussionPages = page.getByRole("navigation", {
    name: "Discussion pages",
  });
  await discussionPages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/commentPage=2/);
  await expect(page.getByText("Seeded discussion 105")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Discussion pages" })
    .getByRole("link", { name: "Previous" })
    .click();
  const workActivityPages = page.getByRole("navigation", {
    name: "Work activity pages",
  });
  await workActivityPages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/activityPage=2/);
  await expect(
    page.getByRole("navigation", { name: "Work activity pages" }),
  ).toContainText("Page 2");

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005c-discussion-desktop.png",
      fullPage: true,
    });
  }
  await page.goto(`/app/${workspaceSlug}/projects/TEAM/brief`);
  await page.getByLabel("Title").fill("Launch constraint");
  await page
    .getByLabel("Context")
    .fill("Keep the rollout limited to the internal delivery team.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByRole("heading", { name: "Launch constraint" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Context")
    .fill(
      "Keep the rollout limited to the internal delivery team until review.",
    );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await expect(page.getByText(/until review/)).toBeVisible();
  await expectBasicAccessibility(page);

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005c-project-brief-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-005c-project-brief-mobile.png",
      fullPage: true,
    });
  }

  await page.goto(`/app/${workspaceSlug}/projects/TEAM/activity`);
  await expect(page.getByText("created a project note")).toBeVisible();
  const projectActivityPages = page.getByRole("navigation", {
    name: "Project activity pages",
  });
  await projectActivityPages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/activity\?page=2/);
  await expect(
    page.getByRole("navigation", { name: "Project activity pages" }),
  ).toContainText("Page 2");
  await seedCollaborationNotifications(email, "TEAM", 55);
  await page.goto(`/app/${workspaceSlug}/inbox`);
  await expect(page.locator("article.notification-row")).toHaveCount(50);
  await expect(
    page.getByText("Showing 50 of 55 accessible notifications."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.locator("article.notification-row")).toHaveCount(5);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByRole("link", { name: "Previous" }).click();
  await expect(page.locator("article.notification-row")).toHaveCount(50);
  await expectBasicAccessibility(page);

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005c-inbox-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-005c-inbox-mobile.png",
      fullPage: true,
    });
    await page.goto(`/app/${workspaceSlug}/projects/TEAM/work/${workItemId}`);
    await removeDevIndicator(page);
    await page.screenshot({
      path: "docs/screenshots/sc-005c-discussion-mobile.png",
      fullPage: true,
    });
  }
});

test("duplicate signup stays generic and an expired database session is rejected", async ({
  page,
  request,
  browser,
}) => {
  const email = `session-${Date.now()}@example.test`;
  const password = "test-password-123";
  await signUpAndVerify(page, request, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Session Boundary");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/app\//);
  const protectedUrl = page.url();

  const duplicateContext = await browser.newContext();
  const duplicatePage = await duplicateContext.newPage();
  await duplicatePage.goto("/sign-up");
  await fillSignUp(duplicatePage, email, password);
  await expect(duplicatePage.getByRole("status")).toContainText(
    /same message is shown/i,
  );
  await duplicateContext.close();

  await expireSessions(email);
  await page.goto(protectedUrl);
  await page.waitForURL(/\/sign-in/);
});

test("client collaboration keeps one commercial truth across internal and external contexts", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const ownerEmail = `client-owner-${suffix}@example.test`;
  const approverEmail = `client-approver-${suffix}@example.test`;
  const password = "test-password-123";

  await signUpAndVerify(page, request, ownerEmail, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Client Collaboration Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Northstar Client");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("PORTAL");
  await page.getByLabel("Project name").fill("Northstar Portal");
  await page.getByLabel("Summary").fill("Private internal project summary");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name: /Northstar Portal/ }).click();
  await page.getByText("New milestone").click();
  const milestoneForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create milestone" }),
  });
  await milestoneForm.getByLabel("Name").fill("Launch handover");
  await milestoneForm
    .getByLabel("Description")
    .fill("Private milestone implementation detail");
  await milestoneForm.getByRole("button", { name: "Create milestone" }).click();

  await Promise.all([
    page.waitForURL(/\/app\/[^/]+\/projects\/[^/]+\/client$/),
    page.getByRole("link", { name: "Client collaboration" }).click(),
  ]);
  const clientManagementUrl = page.url();
  const workspaceSlug = new URL(clientManagementUrl).pathname.split("/")[2]!;
  await page
    .getByLabel("Client summary")
    .fill("A focused view of launch delivery and commercial decisions.");
  await page.getByRole("button", { name: "Save client summary" }).click();
  await page.getByLabel("Milestone").selectOption({ label: "Launch handover" });
  await page
    .getByLabel("Client-safe summary")
    .fill("Launch readiness, handover, and agreed acceptance.");
  await page.getByRole("button", { name: "Add to client view" }).click();
  await page.getByLabel("Email").fill(approverEmail);
  await page.getByLabel("Role").selectOption("approver");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/client/participants") &&
        response.ok(),
    ),
    page.getByRole("button", { name: "Create invitation" }).click(),
  ]);
  const invitationUrl = await page
    .getByLabel("Copyable client invitation")
    .inputValue();

  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(invitationUrl);
  await expect(
    clientPage.getByText(/Sign in or create a verified account/),
  ).toBeVisible();
  await clientPage.getByRole("link", { name: "Create account" }).click();
  await fillSignUp(clientPage, approverEmail, password);
  const verification = await waitForEmailLink(
    request,
    approverEmail,
    "Verify your ScopeDelta account",
  );
  await clientPage.goto(verification);
  await clientPage.getByRole("link", { name: "Continue" }).click();
  await clientPage.waitForURL(/\/client\/projects\//);
  await expect(
    clientPage.getByRole("heading", { name: "Northstar Portal" }),
  ).toBeVisible();
  await expect(
    clientPage.getByRole("link", { name: "Team workspace" }),
  ).toHaveCount(0);
  await expect(clientPage.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(
    clientPage.getByText(
      "A focused view of launch delivery and commercial decisions.",
    ),
  ).toBeVisible();
  await expect(
    clientPage.getByText("Launch readiness, handover, and agreed acceptance."),
  ).toBeVisible();
  await expect(
    clientPage.getByText("Private internal project summary"),
  ).toHaveCount(0);
  await expect(
    clientPage.getByText("Private milestone implementation detail"),
  ).toHaveCount(0);

  const operationsIds = await withTestDatabase(async (pool) => {
    const result = await pool.query<{
      workspace_id: string;
      project_id: string;
    }>(
      `select workspaces.id workspace_id, projects.id project_id
       from workspaces
       inner join projects on projects.workspace_id = workspaces.id
       where workspaces.slug = $1 and projects.key = 'PORTAL'`,
      [workspaceSlug],
    );
    return result.rows[0]!;
  });
  const externalStatuses = await clientPage.evaluate(
    async ({ workspaceId, projectId, monday, today }) => {
      const json = { "content-type": "application/json" };
      const calls: Array<Promise<Response>> = [
        fetch(`/api/v1/workspaces/${workspaceId}/portfolio`),
        fetch(`/api/v1/workspaces/${workspaceId}/capacity`),
        fetch(`/api/v1/workspaces/${workspaceId}/allocations`),
        fetch(`/api/v1/workspaces/${workspaceId}/time-entries`),
        fetch(`/api/v1/workspaces/${workspaceId}/commercial-exposure`),
        fetch(`/api/v1/workspaces/${workspaceId}/capacity/availability`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ weeklyMinutes: 2400, effectiveFrom: monday }),
        }),
        fetch(`/api/v1/workspaces/${workspaceId}/allocations`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            memberUserId: crypto.randomUUID(),
            projectId,
            startWeek: monday,
            endWeek: monday,
            plannedMinutesPerWeek: 60,
          }),
        }),
        fetch(`/api/v1/workspaces/${workspaceId}/time-entries`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            projectId,
            workItemId: null,
            workDate: today,
            durationMinutes: 15,
            classification: "billable",
            note: null,
          }),
        }),
        fetch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/commercial-exposure`,
        ),
      ];
      return Promise.all(calls).then((responses) =>
        responses.map((response) => response.status),
      );
    },
    {
      workspaceId: operationsIds.workspace_id,
      projectId: operationsIds.project_id,
      monday: isoMonday(new Date().toISOString().slice(0, 10)),
      today: new Date().toISOString().slice(0, 10),
    },
  );
  expect(externalStatuses).toEqual(Array(9).fill(404));

  await clientPage.getByLabel("Short title").fill("Add enterprise SSO");
  await clientPage
    .getByLabel("What would you like to change?")
    .fill("Please add SAML sign-in for launch.");
  await clientPage.getByRole("button", { name: "Send request" }).click();
  await expect(clientPage.getByRole("status")).toContainText("Request sent");

  await page.goto(`/app/${workspaceSlug}/inbox`);
  await expect(
    page.getByRole("heading", { name: "Needs your attention" }),
  ).toBeVisible();
  await expect(page.getByText(/submitted a client request in/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Northstar Portal" }),
  ).toBeVisible();
  await page.goto(clientManagementUrl);

  const clientRequestCard = page.locator("article.management-panel").filter({
    hasText: "Add enterprise SSO",
  });
  await clientRequestCard
    .getByLabel("Client-visible clarification prompt")
    .fill("Which identity provider should we support for launch?");
  await clientRequestCard
    .getByRole("button", { name: "Request clarification" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Client-visible clarification requested",
  );

  await clientPage.reload();
  await expect(
    clientPage
      .getByText("Which identity provider should we support for launch?")
      .first(),
  ).toBeVisible();
  await expect(
    clientPage.getByRole("heading", { name: "Needs your attention" }),
  ).toBeVisible();
  const clarificationRequest = clientPage
    .locator("article")
    .filter({ hasText: "Add enterprise SSO" })
    .first();
  await clarificationRequest
    .getByLabel("Reply to the project team")
    .fill("Okta is our launch identity provider.");
  await clarificationRequest
    .getByRole("button", { name: "Send clarification reply" })
    .click();
  await expect(clientPage.getByRole("status")).toContainText(
    "Message added to the shared discussion",
  );

  await page.reload();
  await expect(
    page.getByText("Okta is our launch identity provider."),
  ).toBeVisible();
  await clientRequestCard
    .getByRole("button", { name: "Continue review as open" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "returned to the open commercial review",
  );

  const seeded = await withTestDatabase(async (pool) => {
    const requestRow = await pool.query<{ id: string; project_id: string }>(
      `select id, project_id from commercial_requests
       where title = $1
       order by created_at desc limit 1`,
      ["Add enterprise SSO"],
    );
    const ownerRow = await pool.query<{ id: string }>(
      "select id from users where email = $1",
      [ownerEmail],
    );
    const requestId = requestRow.rows[0]!.id;
    const projectId = requestRow.rows[0]!.project_id;
    const ownerId = ownerRow.rows[0]!.id;
    const decisionId = randomUUID();
    const impactId = randomUUID();
    await pool.query(
      `insert into commercial_decisions
        (id, project_id, request_id, idempotency_key, disposition, rationale,
         confirmed_at, created_by_user_id)
       values ($1, $2, $3, $4, 'paid_change', $5, now(), $6)`,
      [
        decisionId,
        projectId,
        requestId,
        randomUUID(),
        "Private margin rationale",
        ownerId,
      ],
    );
    await pool.query(
      `insert into commercial_impact_assessments
        (id, project_id, request_id, decision_id, idempotency_key, confidence,
         effort_minutes, schedule_delta_days, monetary_amount, currency_code,
         notes, created_by_user_id)
       values ($1, $2, $3, $4, $5, 'confirmed', 2400, 3, 1200, 'USD', $6, $7)`,
      [
        impactId,
        projectId,
        requestId,
        decisionId,
        randomUUID(),
        "Private estimate note",
        ownerId,
      ],
    );
    return { requestId, projectId };
  });

  await page.reload();
  const packetForm = page.locator("form.publication-form").filter({
    hasText: "Add enterprise SSO",
  });
  await packetForm
    .getByLabel("Safe request summary")
    .fill("Add SAML sign-in for launch.");
  await packetForm
    .getByLabel("Safe treatment summary")
    .fill("This is a paid change requiring client approval.");
  await packetForm.getByLabel("Confirmed values").selectOption({ index: 1 });
  await packetForm.getByLabel("Publish monetary amount").check();
  const [packetResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/packets"),
    ),
    packetForm
      .getByRole("button", { name: "Publish successor packet" })
      .click(),
  ]);
  expect(packetResponse.status()).toBe(201);
  await expect(page.getByRole("status")).toContainText(
    "packet version was published",
  );

  await clientPage.goto("/client/notifications");
  await expect(
    clientPage.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(clientPage.getByText("packet published")).toBeVisible();
  await expect(
    clientPage.getByRole("link", { name: "Team workspace" }),
  ).toHaveCount(0);
  await clientPage.getByRole("link", { name: "Open project" }).first().click();
  await expect(clientPage.getByText("USD 1200.00")).toBeVisible();
  await expect(clientPage.getByText("Schedule change: 3 days")).toHaveCount(0);
  const publishedProjection = (await (
    await clientPage.request.get(`/api/v1/client/projects/${seeded.projectId}`)
  ).json()) as {
    data: {
      packets: Array<{
        scheduleDeltaDays: number | null;
        targetDate: string | null;
        monetaryAmount: string | null;
      }>;
    };
  };
  expect(publishedProjection.data.packets[0]).toMatchObject({
    scheduleDeltaDays: null,
    targetDate: null,
    monetaryAmount: "1200.00",
  });
  await expect(clientPage.getByText("Private margin rationale")).toHaveCount(0);
  await expect(clientPage.getByText("Private estimate note")).toHaveCount(0);
  await clientPage.getByRole("button", { name: "Approve" }).click();
  await expect(clientPage.getByRole("status")).toContainText(
    "response was recorded",
  );

  await page.reload();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  const acceptanceForm = page
    .locator("form.publication-form")
    .filter({
      hasText: "Launch handover",
    })
    .last();
  await acceptanceForm
    .getByLabel("What is being accepted?")
    .fill("Accept the published launch handover version.");
  await acceptanceForm.getByLabel(/Packet v1 · Add enterprise SSO/).check();
  await acceptanceForm
    .getByRole("button", { name: "Publish successor target" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "acceptance target was published",
  );

  await clientPage.reload();
  await clientPage.setViewportSize({ width: 390, height: 844 });
  await expect(clientPage.getByText("Commercial context")).toBeVisible();
  await expect(
    clientPage.getByRole("link", {
      name: /Packet v1 · Add enterprise SSO/,
    }),
  ).toBeVisible();
  await expect(
    clientPage.getByRole("heading", { name: "Needs your attention" }),
  ).toBeVisible();
  await Promise.all([
    clientPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/acceptance-targets\/[^/]+\/actions$/.test(response.url()) &&
        response.ok(),
    ),
    clientPage.getByRole("button", { name: "Accept this version" }).click(),
  ]);
  await expect(clientPage.getByRole("status")).toContainText(
    "response was recorded",
  );
  await expectBasicAccessibility(clientPage);

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(clientPage);
    await clientPage.screenshot({
      path: "docs/screenshots/sc-007-client-mobile.png",
      fullPage: true,
    });
    await clientPage.setViewportSize({ width: 1440, height: 1000 });
    await clientPage.screenshot({
      path: "docs/screenshots/sc-007-client-desktop.png",
      fullPage: true,
    });
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/sc-007-internal-desktop.png",
      fullPage: true,
    });
  }

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        /\/client\/participants\/[^/]+$/.test(response.url()) &&
        response.ok(),
    ),
    page.getByRole("button", { name: "Revoke" }).click(),
  ]);
  const revokedApi = await clientPage.request.get(
    `/api/v1/client/projects/${seeded.projectId}`,
  );
  expect(revokedApi.status()).toBe(404);
  const revokedPage = await clientPage.goto(
    `/client/projects/${seeded.projectId}`,
  );
  expect(revokedPage?.status()).toBe(404);
  await expect(clientPage.getByText(/could not be found/i)).toBeVisible();
  await clientContext.close();
});

test("local engineering QA evidence and defects stay traceable without GitHub", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `engineering-${suffix}@example.test`;
  const password = "test-password-123";
  await signUpAndVerify(page, request, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("Engineering Evidence");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Delivery Evidence Client");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("ENG");
  await page.getByLabel("Project name").fill("Engineering QA loop");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name: /Engineering QA loop/ }).click();
  await page.getByRole("link", { name: "Backlog" }).click();
  await page.getByText("New work item").click();
  const workForm = page.locator("form.work-form").filter({
    has: page.getByRole("button", { name: "Create work item" }),
  });
  await workForm.getByLabel("Title").fill("Deliver accessible account shell");
  await workForm.getByLabel("Status").selectOption("in_progress");
  await workForm
    .getByLabel("Acceptance criteria")
    .fill("Keyboard users retain a visible focus indicator.");
  await workForm.getByRole("button", { name: "Create work item" }).click();
  await page
    .getByRole("button", { name: /Deliver accessible account shell/ })
    .click();
  await page
    .getByRole("link", { name: "Open discussion and activity" })
    .click();
  await page.getByLabel("Work purpose").selectOption("client_delivery");
  await page.getByRole("button", { name: "Update classification" }).click();

  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
  await page.goto(`/app/${workspaceSlug}/projects/ENG/engineering`);
  await expect(
    page.getByRole("heading", { name: "Engineering & QA evidence" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No GitHub repository is connected. Local QA, defects, and readiness remain available.",
    ),
  ).toBeVisible();
  const verificationForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Record verification" }),
  });
  await verificationForm.getByLabel("Work item").selectOption({ index: 1 });
  await verificationForm.getByLabel("Result").selectOption("passed");
  await verificationForm.getByLabel("Category").fill("Keyboard regression");
  await verificationForm
    .getByLabel("Concise notes")
    .fill("Tab order and focus visibility verified manually.");
  await verificationForm
    .getByRole("button", { name: "Record verification" })
    .click();
  await expect(
    page.getByText("Keyboard regression", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("passed", { exact: true })).toBeVisible();

  const defectForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Record defect" }),
  });
  await defectForm.getByLabel("Title").fill("Focus ring clips at narrow width");
  await defectForm.getByLabel("Severity").selectOption("high");
  await defectForm.getByLabel("Work item").selectOption({ index: 1 });
  await defectForm
    .getByLabel("Verification evidence")
    .selectOption({ label: "Keyboard regression · passed" });
  await defectForm.getByRole("button", { name: "Record defect" }).click();
  await expect(page.getByText("DEF-1 · high", { exact: true })).toBeVisible();
  const readiness = page.getByLabel("Release readiness gaps");
  await expect(readiness.getByText("Open defects")).toBeVisible();
  await expect(
    readiness.locator("div").filter({ hasText: "Open defects" }).getByText("1"),
  ).toBeVisible();

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.screenshot({
      path: "docs/screenshots/sc-008-engineering-qa-desktop.png",
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: "Resolve defect" }).click();
  await expect(page.getByText("resolved", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: /ENG-1 · Deliver accessible account shell/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "ENG-1 delivery trace" }),
  ).toBeVisible();
  await expect(page.getByText("Keyboard regression · passed")).toBeVisible();
  await expect(
    page.getByText(
      /DEF-1 · Focus ring clips at narrow width · high · resolved/,
    ),
  ).toBeVisible();
});

test("AI delivery jobs stay cited, stale-aware, and human-confirmed", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `ai-${suffix}@example.test`;
  const password = "test-password-123";
  await signUpAndVerify(page, request, email, password, "/onboarding");
  await page.getByLabel(/Workspace name/).fill("AI Delivery");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("New client").click();
  await page.getByLabel("Client name").fill("Synthetic AI Client");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project").click();
  await page.getByLabel("Project key").fill("AIDEV");
  await page.getByLabel("Project name").fill("AI delivery evidence");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name: /AI delivery evidence/ }).click();
  await page.getByRole("link", { name: "Backlog" }).click();
  await page.getByText("New work item").click();
  const workForm = page.locator("form.work-form").filter({
    has: page.getByRole("button", { name: "Create work item" }),
  });
  await workForm.getByLabel("Title").fill("Deliver synthetic export");
  await workForm
    .getByLabel("Acceptance criteria")
    .fill("Authorized users download a valid CSV file.");
  await workForm.getByLabel("Status").selectOption("in_progress");
  await workForm.getByRole("button", { name: "Create work item" }).click();
  await expect(page.getByRole("status")).toHaveText("Work item created.");

  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
  await page.goto(`/app/${workspaceSlug}/projects/AIDEV/commercial`);
  await page.getByText("Record a client request").click();
  const requestForm = page.locator("form.commercial-change-form").filter({
    has: page.getByRole("button", { name: "Record request" }),
  });
  await requestForm.getByLabel("Request title").fill("Add downloadable export");
  await requestForm
    .getByLabel("Original language or concise description")
    .fill("The synthetic sponsor asked for a downloadable CSV export.");
  await requestForm.getByRole("button", { name: "Record request" }).click();
  await expect(page.getByRole("status")).toHaveText("Client request recorded.");
  const requestCard = page.locator("article.commercial-request-card").filter({
    hasText: "Add downloadable export",
  });
  await requestCard.getByRole("link", { name: "Analyze scope change" }).click();

  await expect(
    page.getByRole("heading", { name: "AI delivery intelligence" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The request needs a commercial decision."),
  ).toBeVisible();
  await page.locator(".ai-candidates input[type=checkbox]").first().check();
  await page.locator(".ai-candidates input[type=checkbox]").nth(1).check();
  await page.getByRole("button", { name: "Preview selected drafts" }).click();
  await expect(
    page.getByText(/No request, decision, client publication/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and create drafts" }).click();
  await expect(page.getByText(/created atomically/)).toBeVisible();

  await page
    .locator(".ai-launcher select")
    .first()
    .selectOption("delivery_risk_brief");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("AI interpretation")).toBeVisible();
  await expect(
    page.getByText("One work item lacks QA evidence."),
  ).toBeVisible();

  await page
    .locator(".ai-launcher select")
    .first()
    .selectOption("work_context_qa_pack");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("Draft test scenarios")).toBeVisible();
  await expect(page.getByText("Download valid CSV")).toBeVisible();

  await page
    .getByRole("button", { name: /Scope Change Analyst/ })
    .first()
    .click();
  await expect(page.getByText(/This result is stale/)).toBeVisible();

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await removeDevIndicator(page);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.screenshot({
      path: "docs/screenshots/sc-009-ai-intelligence-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-009-ai-intelligence-mobile.png",
      fullPage: true,
    });
  }

  await page.goto(`/app/${workspaceSlug}/projects/AIDEV/commercial`);
  const refreshedRequest = page
    .locator("article.commercial-request-card")
    .filter({
      hasText: "Add downloadable export",
    });
  await expect(refreshedRequest).toContainText("open");
  await expect(
    refreshedRequest.getByText("Which export format is required?"),
  ).toBeVisible();
  await refreshedRequest.getByRole("button", { name: "Resolve" }).click();
  await expect(
    refreshedRequest.getByText("resolved", { exact: true }),
  ).toBeVisible();
});

function aiFixtureResult(kind?: string, evidenceKey = "ev_request_001") {
  if (kind === "delivery_risk_brief") {
    return {
      interpretation: [
        {
          title: "Verification gap",
          detail: "One work item lacks QA evidence.",
          evidenceKeys: [evidenceKey],
        },
      ],
      recommendedActions: [
        {
          title: "Verify export",
          detail: "Record a focused export verification before acceptance.",
          evidenceKeys: [evidenceKey],
        },
      ],
      watchItems: [],
    };
  }
  if (kind === "work_context_qa_pack") {
    return {
      contextSummary: {
        text: "The export work has explicit acceptance criteria.",
        evidenceKeys: [evidenceKey],
      },
      contradictions: [],
      missingInformation: [],
      testScenarios: [
        {
          title: "Download valid CSV",
          preconditions: ["An authorized user is signed in."],
          steps: ["Open export.", "Download the CSV file."],
          expectedResult: "The downloaded file is valid CSV.",
          evidenceKeys: [evidenceKey],
        },
      ],
    };
  }
  return {
    summary: {
      text: "The request needs a commercial decision.",
      evidenceKeys: [evidenceKey],
    },
    findings: [
      {
        title: "Requested export",
        detail: "The sponsor requested a downloadable export.",
        evidenceKeys: [evidenceKey],
      },
    ],
    uncertainties: [],
    conflicts: [],
    missingQuestions: ["Which format is required?"],
    draftDecision: {
      text: "Review commercial treatment before scheduling.",
      evidenceKeys: [evidenceKey],
    },
    clientSafeWording: {
      text: "We are reviewing the export request.",
      evidenceKeys: [evidenceKey],
    },
    workCandidates: [
      {
        candidateKey: "work_export",
        title: "Prepare export delivery work",
        description: "Implement the confirmed export workflow.",
        acceptanceCriteria: "Authorized users download valid CSV.",
        evidenceKeys: [evidenceKey],
      },
    ],
    clarificationCandidates: [
      {
        candidateKey: "question_format",
        question: "Which export format is required?",
        evidenceKeys: [evidenceKey],
      },
    ],
  };
}

async function signUpAndVerify(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
  callbackURL: string,
) {
  await page.goto(`/sign-up?callbackURL=${encodeURIComponent(callbackURL)}`);
  await fillSignUp(page, email, password);
  await expect(page.getByRole("status")).toContainText(
    /same message is shown/i,
  );
  const verificationUrl = await waitForEmailLink(
    request,
    email,
    "Verify your ScopeDelta account",
  );
  await page.goto(verificationUrl);
  await page.getByRole("link", { name: "Continue" }).click();
  await page.waitForURL(`**${callbackURL}`);
}

async function signUpAndVerifyLocally(
  page: Page,
  email: string,
  password: string,
  callbackURL: string,
) {
  await page.goto(`/sign-up?callbackURL=${encodeURIComponent(callbackURL)}`);
  await fillSignUp(page, email, password);
  await expect(page.getByRole("status")).toContainText(
    /same message is shown/i,
  );
  await withTestDatabase(async (pool) => {
    await pool.query(
      "update users set email_verified = true where email = $1",
      [email],
    );
  });
  await signIn(page, email, password, new RegExp(`${callbackURL}$`));
}

async function fillSignUp(page: Page, email: string, password: string) {
  const name = email.startsWith("owner-")
    ? "Owner Test"
    : email.startsWith("member-")
      ? "Member Test"
      : "Kernel Test";
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  expectedUrl: RegExp = /\/app\//,
) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(expectedUrl);
}

async function waitForEmailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await request.get(`${mailpitUrl}/api/v1/messages`);
    const data = (await response.json()) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    const summary = data.messages.find(
      (message) =>
        message.Subject === subject &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const messageResponse = await request.get(
        `${mailpitUrl}/api/v1/message/${summary.ID}`,
      );
      const message = (await messageResponse.json()) as { Text: string };
      const match = message.Text.match(/https?:\/\/[^\s]+/);
      if (!match) throw new Error("Synthetic email did not contain a link.");
      return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for synthetic email: ${subject}`);
}

async function expireSessions(email: string) {
  await withTestDatabase(async (pool) => {
    await pool.query(
      `update sessions
       set expires_at = now() - interval '1 minute'
       where user_id = (select id from users where email = $1)`,
      [email],
    );
  });
}

async function seedDirectoryVolume(email: string) {
  await withTestDatabase(async (pool) => {
    await pool.query(
      `with target as (
         select workspaces.id as workspace_id, users.id as user_id
         from users
         inner join memberships on memberships.user_id = users.id
         inner join workspaces on workspaces.id = memberships.workspace_id
         where users.email = $1
         limit 1
       ), seeded_clients as (
         insert into clients (workspace_id, name)
         select target.workspace_id,
                'Bulk client ' || lpad(series::text, 3, '0')
         from target
         cross join generate_series(1, 105) as series
         returning id, workspace_id, name
       )
       insert into projects (
         workspace_id,
         client_id,
         key,
         name,
         lead_user_id
       )
       select seeded_clients.workspace_id,
              seeded_clients.id,
              'BULK' || right(seeded_clients.name, 3),
              'Bulk project ' || right(seeded_clients.name, 3),
              target.user_id
       from seeded_clients
       inner join target
         on target.workspace_id = seeded_clients.workspace_id`,
      [email],
    );
  });
}

async function seedPlanningVolume(email: string) {
  await withTestDatabase(async (pool) => {
    await pool.query(
      `with target as (
         select workspaces.id as workspace_id,
                users.id as owner_id,
                (select clients.id
                 from clients
                 where clients.workspace_id = workspaces.id
                 order by clients.created_at
                 limit 1) as client_id
         from users
         inner join memberships on memberships.user_id = users.id
         inner join workspaces on workspaces.id = memberships.workspace_id
         where users.email = $1
         limit 1
       ), seeded_users as (
         insert into users (name, email, email_verified)
         select 'Volume user ' || lpad(series::text, 2, '0'),
                'volume-user-' || substr(target.owner_id::text, 1, 8) || '-' ||
                  lpad(series::text, 2, '0') || '@example.test',
                true
         from target cross join generate_series(1, 50) as series
         returning id
       ), member_rows as (
         insert into memberships (workspace_id, user_id, role)
         select target.workspace_id, seeded_users.id, 'member'
         from target cross join seeded_users
         returning user_id
       ), seeded_projects as (
         insert into projects (
           workspace_id, client_id, key, name, lead_user_id, next_work_item_number
         )
         select target.workspace_id,
                target.client_id,
                'PLAN' || series,
                'Planning project ' || series,
                target.owner_id,
                121
         from target cross join generate_series(1, 3) as series
         returning id, workspace_id
       ), access_rows as (
         insert into project_memberships (
           project_id, workspace_id, user_id, added_by_user_id
         )
         select seeded_projects.id,
                seeded_projects.workspace_id,
                member_rows.user_id,
                target.owner_id
         from seeded_projects
         cross join member_rows
         cross join target
         returning project_id
       )
       insert into work_items (
         project_id, number, title, status, priority,
         assignee_user_id, sort_order
       )
       select seeded_projects.id,
              series,
              'Planning volume ' || lpad(series::text, 3, '0'),
              case when series % 4 = 0 then 'in_progress'::work_item_status
                   else 'ready'::work_item_status end,
              case when series % 5 = 0 then 'high'::work_item_priority
                   else 'medium'::work_item_priority end,
              case when series <= 60 then target.owner_id
                   else (select seeded_users.id
                         from seeded_users
                         offset ((series - 61) % 50)
                         limit 1) end,
              series
       from seeded_projects
       cross join generate_series(1, 120) as series
       cross join target`,
      [email],
    );
  });
}

async function seedCollaborationNotifications(
  email: string,
  projectKey: string,
  total: number,
) {
  await withTestDatabase(async (pool) => {
    await pool.query(
      `with target as (
         select workspaces.id as workspace_id,
                users.id as recipient_id,
                projects.id as project_id,
                work_items.id as work_item_id
         from users
         inner join memberships on memberships.user_id = users.id
         inner join workspaces on workspaces.id = memberships.workspace_id
         inner join projects on projects.workspace_id = workspaces.id and projects.key = $2
         inner join work_items on work_items.project_id = projects.id
         where users.email = $1
         limit 1
       ), actor as (
         insert into users (name, email, email_verified)
         select 'Volume collaborator',
                'collaboration-volume-' || substr(target.recipient_id::text, 1, 8) || '@example.test',
                true
         from target
         returning id
       )
       insert into notifications (
         workspace_id, user_id, kind, actor_user_id,
         project_id, work_item_id, dedupe_key, created_at
       )
       select target.workspace_id,
              target.recipient_id,
              case when series % 3 = 0 then 'mention'::notification_kind
                   when series % 3 = 1 then 'comment_added'::notification_kind
                   else 'comment_reply'::notification_kind end,
              actor.id,
              target.project_id,
              target.work_item_id,
              'volume-notification-' || series,
              now() - (series || ' minutes')::interval
       from target cross join actor cross join generate_series(1, $3::int) as series`,
      [email, projectKey, total],
    );
  });
}

async function seedCollaborationVolume(email: string, projectKey: string) {
  await withTestDatabase(async (pool) => {
    await pool.query(
      `with target as (
         select workspaces.id as workspace_id,
                users.id as owner_id,
                projects.id as project_id,
                work_items.id as work_item_id
         from users
         inner join memberships on memberships.user_id = users.id
         inner join workspaces on workspaces.id = memberships.workspace_id
         inner join projects on projects.workspace_id = workspaces.id and projects.key = $2
         inner join work_items on work_items.project_id = projects.id
         where users.email = $1
         limit 1
       ), volume_users as (
         insert into users (name, email, email_verified)
         select 'Volume member ' || lpad(series::text, 3, '0'),
                'mention-volume-' || series || '-' || substr(target.owner_id::text, 1, 8) || '@example.test',
                true
         from target cross join generate_series(1, 105) as series
         returning id
       ), workspace_access as (
         insert into memberships (workspace_id, user_id, role)
         select target.workspace_id, volume_users.id, 'member'::workspace_role
         from target cross join volume_users
         returning user_id
       )
       insert into project_memberships (
         project_id, workspace_id, user_id, added_by_user_id
       )
       select target.project_id,
              target.workspace_id,
              workspace_access.user_id,
              target.owner_id
       from target cross join workspace_access`,
      [email, projectKey],
    );
    await pool.query(
      `with target as (
         select workspaces.id as workspace_id,
                users.id as owner_id,
                projects.id as project_id,
                work_items.id as work_item_id
         from users
         inner join memberships on memberships.user_id = users.id
         inner join workspaces on workspaces.id = memberships.workspace_id
         inner join projects on projects.workspace_id = workspaces.id and projects.key = $2
         inner join work_items on work_items.project_id = projects.id
         where users.email = $1
         limit 1
       ), aged_parent as (
         update work_item_comments
         set created_at = now() - interval '300 minutes',
             updated_at = now() - interval '300 minutes'
         where id = (
           select work_item_comments.id
           from work_item_comments cross join target
           where work_item_comments.work_item_id = target.work_item_id
             and work_item_comments.parent_comment_id is null
           order by work_item_comments.created_at
           limit 1
         )
         returning id
       ), seeded_comments as (
         insert into work_item_comments (
           project_id, work_item_id, author_user_id,
           request_id, body, created_at, updated_at
         )
         select target.project_id,
                target.work_item_id,
                target.owner_id,
                gen_random_uuid(),
                'Seeded discussion ' || lpad(series::text, 3, '0'),
                now() - (series || ' minutes')::interval,
                now() - (series || ' minutes')::interval
         from target cross join aged_parent
         cross join generate_series(1, 105) as series
         returning id
       )
       insert into audit_events (
         workspace_id, actor_type, actor_id, event_type,
         target_type, target_id, occurred_at, metadata
       )
       select target.workspace_id,
              'human'::audit_actor_type,
              target.owner_id,
              'work_item.comment.created.v1',
              'work_item_comment',
              gen_random_uuid(),
              now() - (series || ' minutes')::interval,
              jsonb_build_object(
                'projectId', target.project_id::text,
                'workItemId', target.work_item_id::text
              )
       from target cross join seeded_comments
       cross join generate_series(1, 55) as series
       limit 55`,
      [email, projectKey],
    );
  });
}

async function workItemIdFor(email: string, projectKey: string) {
  return withTestDatabase(async (pool) => {
    const result = await pool.query<{ id: string }>(
      `select work_items.id
       from users
       inner join memberships on memberships.user_id = users.id
       inner join projects on projects.workspace_id = memberships.workspace_id
       inner join work_items on work_items.project_id = projects.id
       where users.email = $1 and projects.key = $2
       order by work_items.number
       limit 1`,
      [email, projectKey],
    );
    return result.rows[0]!.id;
  });
}

async function expectBasicAccessibility(page: Page) {
  const violations = await page.evaluate(() => {
    const issues: string[] = [];
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map(
      (element) => element.id,
    );
    if (new Set(ids).size !== ids.length) issues.push("duplicate ids");
    for (const control of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input:not([type=hidden]), select, textarea")) {
      const labelled = Boolean(
        control.getAttribute("aria-label") ||
        control.getAttribute("aria-labelledby") ||
        control.labels?.length,
      );
      if (!labelled) issues.push(`unlabelled ${control.tagName.toLowerCase()}`);
    }
    for (const image of document.querySelectorAll("img")) {
      if (!image.hasAttribute("alt")) issues.push("image missing alt");
    }
    return issues;
  });
  expect(violations).toEqual([]);
}

async function withTestDatabase<T>(work: (pool: Pool) => Promise<T>) {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is required for browser tests.");
  }
  const pool = new Pool({
    connectionString,
  });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

async function removeDevIndicator(page: Page) {
  await page
    .locator("nextjs-portal")
    .evaluateAll((elements) => elements.forEach((element) => element.remove()));
}

async function openProjectMore(page: Page) {
  const menu = page.locator("details.project-more-menu");
  if (!(await menu.evaluate((element) => element.hasAttribute("open")))) {
    await menu.locator("summary").click();
  }
}

function isoDateOffset(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoMonday(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
