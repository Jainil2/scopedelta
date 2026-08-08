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

  if (process.env.UPDATE_SCREENSHOTS === "1") {
    await page
      .locator("nextjs-portal")
      .evaluateAll((elements) =>
        elements.forEach((element) => element.remove()),
      );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/screenshots/sc-005a-backlog-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/sc-005a-backlog-mobile.png",
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

async function withTestDatabase(work: (pool: Pool) => Promise<void>) {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is required for browser tests.");
  }
  const pool = new Pool({
    connectionString,
  });
  try {
    await work(pool);
  } finally {
    await pool.end();
  }
}
