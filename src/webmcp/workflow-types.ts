import type { z } from "zod";

export type WorkflowSurface = "public" | "setup" | "workspace" | "client";
export type WorkflowConfirmation = {
  title: string;
  action: string;
  details: Record<string, unknown>;
};
export type WorkflowContext = {
  surface: WorkflowSurface;
  workspaceSlug?: string;
  confirm?: (
    request: WorkflowConfirmation,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  navigate?: (path: string) => void;
  download?: (blob: Blob, filename: string) => void;
};
export type WorkflowOperation = {
  action: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: z.ZodType;
  query?: z.ZodType;
  confirmation?: boolean;
  download?: boolean;
  handoff?: string;
  automaticKeys?: string[];
  defaultLead?: boolean;
  textExcerpt?: boolean;
  privateInvitation?: boolean;
};
export type WorkflowDefinition = {
  name: string;
  title: string;
  category: string;
  description: string;
  surfaces: WorkflowSurface[];
  operations: WorkflowOperation[];
};
