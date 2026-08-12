import { randomUUID } from "node:crypto";

import {
  expect,
  type APIRequestContext,
  type Page,
  test,
} from "@playwright/test";
import { Pool } from "pg";

const mailpitUrl = "http://127.0.0.1:8025";

test.beforeAll(async () => {
  await withTestDatabase(async (pool) => {
    await pool.query("truncate table auth_rate_limits, action_rate_limits");
  });
});

test("verified signup, workspace persistence, invitation, and role management", async ({
  page,
  request,
  browser,
}) => {
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
  await expect(page.getByText("Invitation sent.")).toBeVisible();

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
  await memberContext.close();

  await page.reload();
  const memberRole = page.getByRole("combobox", {
    name: "Role for Member Test",
  });
  await expect(memberRole).toBeVisible();
  await memberRole.selectOption("admin");
  await expect(memberRole).toHaveValue("admin");

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

  await page.getByText("New milestone").click();
  const milestoneForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create milestone" }),
  });
  await milestoneForm.getByLabel("Name").fill("Private beta");
  await milestoneForm.getByLabel("Target date").fill("2026-11-20");
  await milestoneForm.getByRole("button", { name: "Create milestone" }).click();
  await expect(page.getByRole("status")).toHaveText("Milestone created.");
  await page.getByRole("link", { name: "Backlog" }).click();

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

  await page.getByRole("link", { name: "Commercial" }).click();
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

  const workspaceSlug = new URL(page.url()).pathname.split("/")[2]!;
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
    page.getByRole("link", { name: "Client view" }).click(),
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
  await packetForm
    .getByRole("button", { name: "Publish successor packet" })
    .click();
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
