import { z } from "zod";

import type { WorkflowRuntime } from "./workflows";

export const WORKSPACE_DESTINATIONS = {
  overview: "",
  workflows: "/workflows",
  clients: "/clients",
  projects: "/projects",
  my_work: "/my-work",
  inbox: "/inbox",
  portfolio: "/operations",
  capacity: "/operations/capacity",
  time: "/operations/time",
  exposure: "/operations/exposure",
  settings: "/settings",
  members: "/settings/members",
  billing: "/settings/billing",
  getting_started: "/settings/getting-started",
  adoption: "/settings/adoption",
} as const;
export const PROJECT_DESTINATIONS = {
  project: "",
  backlog: "/backlog",
  board: "/board",
  cycles: "/cycles",
  brief: "/brief",
  activity: "/activity",
  commercial: "/commercial",
  client: "/client",
  engineering: "/engineering",
  ai: "/ai",
} as const;

export const HUMAN_FLOWS = [
  {
    name: "account_access",
    title: "Account access",
    description:
      "Open sign-in, registration, password recovery or email-verification status. The person enters their credentials and completes verification.",
    actions: {
      sign_in: "/sign-in",
      sign_up: "/sign-up",
      recover_password: "/forgot-password",
      verification: "/verification-status",
    },
  },
  {
    name: "invitation_access",
    title: "Accept an invitation",
    description:
      "Open the invitation screen for an already-staged invitation. Ask the person to open the private link from their email if no invitation is staged; never request or return its token.",
    actions: {
      workspace: "/invitations/accept",
      client: "/client/invitations/accept",
    },
  },
  {
    name: "desktop_preferences",
    title: "Desktop preferences",
    description:
      "Explain how to continue notification permissions, external sign-in and local preferences in the native ScopeDelta desktop app. Browser tools cannot change native preferences.",
    actions: { instructions: null },
  },
  {
    name: "pilot_interest",
    title: "Apply for a pilot",
    description:
      "Open the public pilot form for the person to review and submit their contact details and requirements.",
    actions: { open_form: "/#pilot" },
  },
] as const;

export function createNavigationTools(
  config: WorkflowRuntime,
): WebMCP.ModelContextTool[] {
  const surface = config.workflowContext?.surface ?? "workspace";
  function navigate(path: string | null) {
    if (config.isActive && !config.isActive())
      throw new Error("Discover tools again on the current page.");
    if (path) config.workflowContext?.navigate?.(path);
    return {
      status: "human_step_required",
      path,
      message: path
        ? "Continue in the opened ScopeDelta screen. No form was submitted."
        : "Open ScopeDelta desktop preferences to change local settings; use its sign-in and notification controls for OS permissions.",
    };
  }
  const tools: WebMCP.ModelContextTool[] = HUMAN_FLOWS.map((flow) => ({
    name: flow.name,
    title: flow.title,
    description: flow.description,
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: Object.keys(flow.actions) },
      },
      required: ["action"],
      additionalProperties: false,
    },
    execute: (raw) => {
      const input = z
        .object({
          action: z.enum(Object.keys(flow.actions) as [string, ...string[]]),
        })
        .strict()
        .parse(raw);
      return navigate(
        (flow.actions as Record<string, string | null>)[input.action],
      );
    },
  }));
  const schema =
    surface === "workspace"
      ? z
          .object({
            destination: z.enum([
              ...Object.keys(WORKSPACE_DESTINATIONS),
              ...Object.keys(PROJECT_DESTINATIONS),
            ] as [string, ...string[]]),
            projectKey: z
              .string()
              .regex(/^[A-Z][A-Z0-9]{1,9}$/)
              .optional(),
          })
          .strict()
      : z
          .object({
            destination: z.enum([
              "workspace_setup",
              "workspaces",
              "client_projects",
              "client_inbox",
            ]),
          })
          .strict();
  tools.push({
    name: "open_workflow",
    title: "Open a workflow screen",
    description:
      "Navigate to an ordinary ScopeDelta screen without submitting anything. Project screens require the authorized project key returned by project_lifecycle. Reads and access checks happen in the destination page.",
    inputSchema: z.toJSONSchema(schema),
    execute: (raw) => {
      const input = schema.parse(raw);
      if (surface !== "workspace")
        return navigate(
          (
            {
              workspace_setup: "/onboarding",
              workspaces: "/app",
              client_projects: "/client",
              client_inbox: "/client/notifications",
            } as Record<string, string>
          )[input.destination],
        );
      const root = `/app/${encodeURIComponent(config.workflowContext?.workspaceSlug ?? "")}`;
      if (!config.workflowContext?.workspaceSlug)
        throw new Error("Open a workspace first.");
      if (Object.hasOwn(WORKSPACE_DESTINATIONS, input.destination))
        return navigate(
          root +
            WORKSPACE_DESTINATIONS[
              input.destination as keyof typeof WORKSPACE_DESTINATIONS
            ],
        );
      const key = "projectKey" in input ? input.projectKey : undefined;
      if (!key)
        return {
          status: "invalid_input",
          message: "Provide projectKey from project_lifecycle.list/read.",
        };
      return navigate(
        `${root}/projects/${key}${PROJECT_DESTINATIONS[input.destination as keyof typeof PROJECT_DESTINATIONS]}`,
      );
    },
  });
  return tools;
}
