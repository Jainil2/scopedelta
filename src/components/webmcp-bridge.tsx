"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import {
  getServerWebMcpStatus,
  getWebMcpStatus,
  registerScopeDeltaWebMcp,
  subscribeWebMcpStatus,
} from "@/webmcp";

export function WebMcpBridge({
  workspaceId,
  userId,
}: Readonly<{ workspaceId: string; userId: string }>) {
  const router = useRouter();
  const status = useSyncExternalStore(
    subscribeWebMcpStatus,
    getWebMcpStatus,
    getServerWebMcpStatus,
  );

  useEffect(() => {
    const registration = registerScopeDeltaWebMcp({
      workspaceId,
      userId,
      onWorkItemCreated: () => router.refresh(),
    });
    void registration.ready.catch(() => undefined);
    return registration.dispose;
  }, [router, userId, workspaceId]);

  const label =
    status.phase === "unavailable"
      ? "Browser tools unavailable"
      : status.phase === "registering"
        ? "Registering browser tools…"
        : `${status.registeredTools.length} browser tools active`;

  return (
    <div
      className="webmcp-status"
      data-state={status.phase}
      aria-live="polite"
      title={status.registeredTools.join(", ") || undefined}
    >
      <span className="webmcp-status-dot" aria-hidden="true" />
      <span>{label}</span>
      {status.phase === "available" && status.registeredTools.length > 0 ? (
        <span className="webmcp-tool-names">
          {status.registeredTools.join(", ")}
        </span>
      ) : null}
    </div>
  );
}
