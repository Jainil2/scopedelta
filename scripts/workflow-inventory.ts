import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { format } from "prettier";

import { HUMAN_FLOWS } from "../src/webmcp/workflow-navigation";

import { WORKFLOW_CATALOG } from "../src/webmcp/workflow-catalog";

const root = process.cwd();
const output = join(root, "docs/workflows");
mkdirSync(output, { recursive: true });
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
const controlTags = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "Link",
  "summary",
  "form",
  "Button",
  "Input",
  "Select",
  "Textarea",
  "Checkbox",
  "TabsTrigger",
  "DropdownMenuItem",
  "DialogTrigger",
  "SheetTrigger",
  "SelectTrigger",
]);
const controls: Record<string, string>[] = [];
const operations: Record<string, string>[] = [];

function scopeOf(node: ts.Node): string {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name)
      return parent.name.text;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
      return parent.name.text;
  }
  return "module";
}
const componentFlows: Record<string, string[]> = {
  "platform-forms": [
    "workspace_setup",
    "workspace_settings",
    "workspace_members",
    "workspace_invitations",
  ],
  "delivery-workspace": [
    "client_accounts",
    "project_lifecycle",
    "project_members",
    "project_milestones",
    "delivery_work",
    "project_labels",
  ],
  "planning-workspace": [
    "assigned_work",
    "delivery_work",
    "delivery_cycles",
    "work_dependencies",
  ],
  "commercial-workspace": [
    "commercial_evidence",
    "commercial_scope",
    "commercial_agreement",
    "commercial_drift_ledger",
    "work_commercial_basis",
  ],
  "commercial-change-control": [
    "commercial_requests",
    "commercial_decisions",
    "commercial_impact",
    "commercial_agreement",
  ],
  "collaboration-workspace": [
    "work_discussion",
    "work_subscription",
    "project_notes",
    "project_activity",
    "workspace_inbox",
  ],
  "client-collaboration-workspace": [
    "client_publication",
    "client_participants",
    "client_request_review",
    "client_acceptance_publication",
    "client_team_discussion",
  ],
  "client-project-workspace": [
    "client_project_access",
    "client_requests",
    "client_discussion",
    "client_packet_response",
    "client_delivery_acceptance",
  ],
  "client-notification-inbox": ["client_inbox"],
  "engineering-workspace": [
    "engineering_evidence",
    "engineering_repositories",
    "qa_verification",
    "delivery_defects",
  ],
  "ai-delivery-workspace": [
    "ai_analysis",
    "ai_candidate_review",
    "commercial_clarifications",
  ],
  "operations-workspace": [
    "portfolio_review",
    "capacity_planning",
    "project_allocations",
    "time_tracking",
    "commercial_exposure",
  ],
  "operations-forms": [
    "capacity_planning",
    "project_allocations",
    "time_tracking",
  ],
  "adoption-workspace": [
    "project_templates",
    "delivery_import",
    "workspace_exports",
  ],
  "self-service-workspace": [
    "workspace_onboarding",
    "workspace_exports",
    "workspace_lifecycle",
  ],
  "billing-workspace": ["workspace_billing"],
};
function classification(file: string, component: string) {
  const base = file
    .split("/")
    .at(-1)!
    .replace(/\.tsx$/, "");
  let flows = componentFlows[base] ?? [];
  // Narrow the large delivery module by the actual rendered component.
  if (component === "ClientDirectory") flows = ["client_accounts"];
  if (component === "ProjectDirectory") flows = ["project_lifecycle"];
  if (component === "ProjectOverview")
    flows = ["project_lifecycle", "project_members", "project_milestones"];
  if (component === "BacklogWorkspace" || component === "WorkItemForm")
    flows = ["delivery_work", "project_labels"];
  const componentOverrides: Record<string, string[]> = {
    CapacityPage: ["capacity_planning", "project_allocations"],
    ExposurePage: ["commercial_exposure"],
    PortfolioPage: ["portfolio_review"],
    TimePage: ["time_tracking"],
    MembersPage: ["workspace_members", "workspace_invitations"],
    ClientNotificationsPage: ["client_inbox"],
    ClientHomePage: ["client_project_access"],
    OnboardingPage: ["workspace_setup"],
    WorkspaceCreateForm: ["workspace_setup"],
    WorkspaceSettingsForm: ["workspace_settings"],
    MemberManagement: ["workspace_members", "workspace_invitations"],
    WorkspaceMemberPicker: ["workspace_members"],
    BoardWorkspace: ["delivery_work", "work_dependencies"],
    CyclesWorkspace: ["delivery_cycles"],
    CycleForm: ["delivery_cycles"],
    CycleFields: ["delivery_cycles"],
    MyWorkWorkspace: ["assigned_work"],
    WorkEditor: ["delivery_work"],
    ProjectBriefWorkspace: ["project_notes"],
    ActivityWorkspace: ["project_activity"],
    WorkCollaborationWorkspace: [
      "work_discussion",
      "work_subscription",
      "project_activity",
    ],
    CommentRow: ["work_discussion"],
    InboxWorkspace: ["workspace_inbox"],
  };
  flows = componentOverrides[component] ?? flows;
  if (component === "InvitationAcceptance")
    return {
      category: "Account access",
      flows: "invitation_access",
      mode: "Human invitation handoff",
    };
  if (flows.length)
    return {
      category: [
        ...new Set(
          flows.map(
            (name) =>
              WORKFLOW_CATALOG.find((flow) => flow.name === name)?.category,
          ),
        ),
      ].join(" / "),
      flows: flows.join(", "),
      mode: "Business flow / supporting control",
    };
  if (/auth|invitation|invite|verif|password/.test(file))
    return {
      category: "Account access",
      flows: "account_access / invitation_access",
      mode: "Human credential or invitation handoff",
    };
  if (/desktop/.test(file))
    return {
      category: "Desktop",
      flows: "desktop_preferences",
      mode: "Native application / browser handoff",
    };
  if (/lead-form|src\/app\/page/.test(file))
    return {
      category: "Public site",
      flows: "pilot_interest",
      mode: "Public navigation / pilot application",
    };
  return {
    category: "Navigation and interaction",
    flows: "discover_workflows / open_workflow",
    mode: "Navigation, display or reusable control",
  };
}
function short(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 320);
}

for (const path of files(join(root, "src"))) {
  const file = relative(root, path);
  if (
    /\.(test|spec)\./.test(file) ||
    file.includes("/test/") ||
    file.includes("/components/ui/")
  )
    continue;
  if (!file.endsWith(".tsx") && !file.endsWith("/route.ts")) continue;
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node: ts.Node) {
    if (file.endsWith("/route.ts")) {
      let method: string | undefined;
      if (
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        )
      )
        method = node.name?.text;
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        )
      ) {
        for (const declaration of node.declarationList.declarations)
          if (
            ts.isIdentifier(declaration.name) &&
            /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(
              declaration.name.text,
            )
          )
            addOperation(declaration.name.text, node);
      }
      if (method && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method))
        addOperation(method, node);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const interactive =
        controlTags.has(tag) ||
        attributes.some((attribute) =>
          /^on[A-Z]|^draggable$/.test(attribute.name.getText(source)),
        ) ||
        /Picker$/.test(tag);
      if (interactive) {
        const enclosing = ts.isJsxOpeningElement(node) ? node.parent : node;
        const component = scopeOf(node);
        const attr = (name: string) =>
          attributes
            .find((attribute) => attribute.name.getText(source) === name)
            ?.initializer?.getText(source) ?? "";
        let label =
          attr("aria-label") ||
          attr("title") ||
          attr("label") ||
          attr("placeholder") ||
          attr("name");
        if (!label && ts.isJsxElement(enclosing))
          label = enclosing.children
            .map((child) => child.getText(source))
            .join(" ");
        controls.push({
          file,
          line: String(
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
          ),
          component,
          control: tag,
          label: short(label) || "Dynamic/reusable control",
          handlers: short(
            attributes
              .filter((attribute) =>
                /^on[A-Z]|^action$|^href$/.test(attribute.name.getText(source)),
              )
              .map((attribute) => attribute.getText(source))
              .join("; "),
          ),
          ...classification(file, component),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  function addOperation(method: string, node: ts.Node) {
    const route =
      "/" + file.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "");
    const matches = WORKFLOW_CATALOG.flatMap((flow) =>
      flow.operations
        .filter(
          (operation) =>
            operation.path === route && operation.method === method,
        )
        .map((operation) => ({ flow, operation })),
    );
    let mode = "";
    if (matches.length)
      mode = matches.some(({ operation }) => operation.handoff)
        ? "Human handoff"
        : matches.some(({ operation }) => operation.confirmation)
          ? "Tool with human confirmation"
          : "Tool";
    else if (/webhook|callback/.test(route))
      mode = "Signed provider callback; not an agent action";
    else if (/\/auth\//.test(route)) mode = "Human account credential flow";
    else if (/invitations/.test(route)) mode = "Human invitation/token handoff";
    else if (/\/desktop\//.test(route))
      mode = "Native bootstrap/notification transport";
    else if (route === "/api/leads") mode = "Human pilot application handoff";
    else throw new Error(`Unaccounted API operation: ${method} ${route}`);
    operations.push({
      method,
      route,
      flow: matches
        .map(({ flow, operation }) => `${flow.name}.${operation.action}`)
        .join(", "),
      mode,
      authorization: route.startsWith("/api/v1/workspaces")
        ? "Authenticated workspace membership and operation-specific server policy; docs/AUTHORIZATION_MATRIX.md"
        : route.startsWith("/api/v1/client/") && matches.length
          ? "Authenticated client projection; collaborator/approver server policy; docs/AUTHORIZATION_MATRIX.md"
          : "Existing credential, provider, native or public boundary; see linked route",
      file,
      line: String(
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      ),
    });
  }
  visit(source);
}

function csv(rows: Record<string, string>[]) {
  const keys = Object.keys(rows[0]);
  const cell = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  return (
    [
      keys.map(cell).join(","),
      ...rows.map((row) => keys.map((key) => cell(row[key] ?? "")).join(",")),
    ].join("\n") + "\n"
  );
}
controls.sort(
  (left, right) =>
    left.category.localeCompare(right.category) ||
    left.flows.localeCompare(right.flows) ||
    left.file.localeCompare(right.file) ||
    Number(left.line) - Number(right.line),
);
writeFileSync(join(output, "interaction-inventory.csv"), csv(controls));
writeFileSync(join(output, "api-coverage.csv"), csv(operations));

const categories = [...new Set(WORKFLOW_CATALOG.map((flow) => flow.category))];
const lines = [
  "# ScopeDelta interaction and workflow inventory",
  "",
  "Owner: [WEBMCP-002 #76](https://github.com/Jainil2/scopedelta/issues/76). Regenerate with `pnpm exec tsx scripts/workflow-inventory.ts`.",
  "",
  `The current source contains **${controls.length} application control declarations** and **${operations.length} API method/route operations**. The catalog defines **${WORKFLOW_CATALOG.length} business workflow tools**, alongside discovery/navigation and the four compatible original tools.`,
  "",
  "- [Every button, form, link, field and interaction](interaction-inventory.csv): source file/line, containing component, label or dynamic expression, handler, category and related flows.",
  "- [Every API operation and its use](api-coverage.csv): tool/action mapping or explicit provider/native/human boundary.",
  "",
  "Counts describe source declarations, not the number of controls visible to a particular role. Dynamic lists instantiate controls per record; shared UI primitives and tests are excluded. Navigation, filtering, disclosures, selection and keyboard controls support their containing flow rather than becoming unrelated mutation tools. Source expressions are retained when labels vary with state.",
  "",
  `The workflow tools directly invoke **${operations.filter((operation) => operation.mode.startsWith("Tool")).length} API operations**. ${operations.filter((operation) => operation.mode === "Human handoff").length} billing/provider operations continue in their ordinary UI; the other ${operations.filter((operation) => !operation.mode.startsWith("Tool") && operation.mode !== "Human handoff").length} declared operations are identified credential, invitation, native, callback or public-form boundaries. There are also six discovery/navigation/handoff tools and four compatible original shortcuts. See [first-user usage](USAGE.md), [authorization rules](../AUTHORIZATION_MATRIX.md), and [validation evidence](EVIDENCE.md).`,
  "",
  "## Categories and functional flows",
  "",
];
for (const category of categories) {
  lines.push(
    `### ${category}`,
    "",
    "| Flow / tool | Functional requirement | Actions |",
    "| --- | --- | --- |",
  );
  for (const flow of WORKFLOW_CATALOG.filter(
    (flow) => flow.category === category,
  ))
    lines.push(
      `| \`${flow.name}\` | ${flow.description.replaceAll("|", "\\|")} | ${flow.operations.map((op) => `\`${op.action}\`${op.handoff ? " (human step)" : op.confirmation ? " (confirm)" : ""}`).join(", ")} |`,
    );
  lines.push("");
}
lines.push(
  "## Navigation and human handoffs",
  "",
  "`discover_workflows` finds relevant actions. `open_workflow` navigates to a fixed ordinary screen, with an explicit project key for project screens.",
  "",
  "| Flow / tool | Requirement | Actions |",
  "| --- | --- | --- |",
);
for (const flow of HUMAN_FLOWS)
  lines.push(
    `| \`${flow.name}\` | ${flow.description} | ${Object.keys(flow.actions).join(", ")} |`,
  );
lines.push(
  "",
  "Workspace pages register the original four tools, discovery/navigation, four handoff tools, and workspace business flows. Setup pages register workspace setup plus discovery/navigation/handoffs; authenticated client pages register only client projection flows plus discovery/navigation/handoffs. Public account pages expose only discovery/navigation/handoffs.",
  "",
);
lines.push(
  "## Complete work sequences",
  "",
  "1. **First-time delivery:** sign in → workspace_setup.create → client_accounts.create → project_lifecycle.create → project_milestones / delivery_cycles → delivery_work.create/update → qa_verification → project_lifecycle.update (completed).",
  "2. **Commercial change:** commercial_evidence → commercial_agreement draft → commercial_scope → activate agreement → work_commercial_basis → commercial_requests → commercial_impact → commercial_decisions → amendment → commercial_drift_ledger.",
  "3. **Client collaboration:** client_participants → client_publication → external client_project_access / client_requests → client_request_review / client_team_discussion → publish packet → client_packet_response → client_acceptance_publication → client_delivery_acceptance.",
  "4. **Engineering and QA:** engineering_repositories → engineering_evidence → qa_verification → delivery_defects → verification and readiness review.",
  "5. **AI assistance:** ai_analysis.start → read completed job → ai_candidate_review.preview → human confirmation → confirm → ordinary delivery/clarification records.",
  "6. **Agency operations:** portfolio_review → capacity_planning → project_allocations → time_tracking → commercial_exposure.",
  "7. **Reuse and portability:** project_templates → delivery_import.preview/read → human confirmation → confirm → workspace_exports.",
  "8. **Administration:** workspace_members / workspace_invitations → workspace_settings / workspace_onboarding → workspace_billing → workspace_exports → workspace_lifecycle request/cancel.",
  "",
  "## Boundaries",
  "",
  "Credential entry, staged invitation tokens, provider OAuth consent, payment completion, native desktop preferences, and public pilot applications retain their existing human UI. Signed webhooks and OAuth callbacks are infrastructure transport and cannot become general agent commands. Browser tools never execute operator purge jobs. The server remains authoritative for roles, tenancy, entitlements, stale versions and evidence.",
  "",
);
void format(lines.join("\n"), { parser: "markdown" }).then((formatted) => {
  writeFileSync(join(output, "README.md"), formatted);
});
console.log(
  JSON.stringify({
    controls: controls.length,
    apiOperations: operations.length,
    workflows: WORKFLOW_CATALOG.length,
    output: "docs/workflows",
  }),
);
