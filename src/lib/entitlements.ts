export type PlatformCapability =
  | "workspace.create"
  | "workspace.settings.update"
  | "workspace.members.manage"
  | "workspace.invitation.accept"
  | "delivery.client.manage"
  | "delivery.project.manage"
  | "delivery.work.manage";

export type EntitlementContext = {
  userId: string;
  workspaceId?: string;
};

export interface EntitlementPolicy {
  assertAllowed(
    capability: PlatformCapability,
    context: EntitlementContext,
  ): Promise<void>;
}

export const communityEntitlementPolicy: EntitlementPolicy = {
  async assertAllowed() {
    // Layer 0 has no commercial plan rules. Managed editions can replace this
    // policy at the composition boundary without changing domain services.
  },
};
