import type {
  ClientAcceptanceAction,
  ClientPacketAction,
  ClientPacketRequirement,
  ClientParticipantRole,
  ClientProjectionTarget,
  CommercialDecisionDisposition,
  CommercialRequestState,
  MilestoneStatus,
} from "@/db/schema";

export type ClientProjectProjection = {
  project: {
    id: string;
    name: string;
    summary: string | null;
  };
  participant: {
    id: string;
    role: ClientParticipantRole;
  } | null;
  items: Array<{
    id: string;
    target: ClientProjectionTarget;
    title: string;
    summary: string;
    status: MilestoneStatus | null;
    targetDate: string | null;
  }>;
  requests: Array<{
    id: string;
    title: string;
    requestText: string;
    state: CommercialRequestState;
    receivedAt: string;
    submittedByCurrentParticipant: boolean;
    needsReply: boolean;
  }>;
  packets: Array<{
    id: string;
    requestId: string;
    version: number;
    current: boolean;
    disposition: CommercialDecisionDisposition;
    requirement: ClientPacketRequirement;
    title: string;
    requestSummary: string;
    treatmentSummary: string;
    scopeSummary: string | null;
    assumptions: string | null;
    scheduleDeltaDays: number | null;
    targetDate: string | null;
    monetaryAmount: string | null;
    currencyCode: string | null;
    publishedAt: string;
    action: {
      action: ClientPacketAction;
      comment: string | null;
      actedAt: string;
    } | null;
    actionable: boolean;
  }>;
  acceptanceTargets: Array<{
    id: string;
    projectItemId: string;
    version: number;
    current: boolean;
    title: string;
    summary: string;
    status: string | null;
    targetDate: string | null;
    packetIds: string[];
    publishedAt: string;
    action: {
      action: ClientAcceptanceAction;
      comment: string | null;
      actedAt: string;
    } | null;
    actionable: boolean;
  }>;
  discussion: Array<{
    id: string;
    target: "request" | "packet" | "acceptance_target";
    targetId: string;
    author: "client" | "team";
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  attention: Array<{
    kind: "clarification" | "packet" | "acceptance";
    targetId: string;
    label: string;
  }>;
  history: {
    page: number;
    pageSize: number;
    hasNewer: boolean;
    hasOlder: boolean;
    hasMore: {
      requests: boolean;
      packets: boolean;
      acceptanceTargets: boolean;
      discussion: boolean;
    };
  };
};

export const CLIENT_PROJECT_PROJECTION_KEYS = [
  "project",
  "participant",
  "items",
  "requests",
  "packets",
  "acceptanceTargets",
  "discussion",
  "attention",
  "history",
] as const satisfies ReadonlyArray<keyof ClientProjectProjection>;

export function packetRequirementForDisposition(
  disposition: CommercialDecisionDisposition,
): ClientPacketRequirement {
  return disposition === "swap" || disposition === "paid_change"
    ? "approval"
    : "informational";
}
