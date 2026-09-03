"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type {
  WorkflowConfirmation,
  WorkflowSurface,
} from "@/webmcp/workflow-types";

import {
  getServerWebMcpStatus,
  getWebMcpStatus,
  registerScopeDeltaWebMcp,
  subscribeWebMcpStatus,
} from "@/webmcp";

export function WebMcpBridge({
  workspaceId,
  userId,
  workspaceSlug,
  surface = "workspace",
}: Readonly<{
  workspaceId: string;
  userId: string;
  workspaceSlug?: string;
  surface?: WorkflowSurface;
}>) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef<((approved: boolean) => void) | null>(null);
  const [confirmation, setConfirmation] = useState<WorkflowConfirmation | null>(
    null,
  );
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
      workflowContext: {
        surface,
        workspaceSlug,
        navigate: (path) => router.push(path),
        download: (blob, filename) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        },
        confirm: (request, signal) =>
          new Promise<boolean>((resolve) => {
            if (pendingRef.current || signal?.aborted) {
              resolve(false);
              return;
            }
            const finish = (approved: boolean) => {
              signal?.removeEventListener("abort", cancel);
              pendingRef.current = null;
              setConfirmation(null);
              resolve(approved);
            };
            const cancel = () => finish(false);
            pendingRef.current = finish;
            signal?.addEventListener("abort", cancel, { once: true });
            setConfirmation(request);
          }),
      },
    });
    void registration.ready.catch(() => undefined);
    return () => {
      pendingRef.current?.(false);
      registration.dispose();
    };
  }, [router, userId, workspaceId, workspaceSlug, surface]);

  useEffect(() => {
    if (confirmation) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirmation]);

  const label =
    status.phase === "unavailable"
      ? "Browser tools unavailable"
      : status.phase === "registering"
        ? "Registering browser tools…"
        : `${status.registeredTools.length} browser tools active`;

  return (
    <>
      <div
        className="webmcp-status"
        data-state={status.phase}
        data-surface={surface}
        aria-live="polite"
        title={status.registeredTools.join(", ") || undefined}
      >
        <span className="webmcp-status-dot" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {confirmation
        ? createPortal(
            <dialog
              ref={dialogRef}
              className="workflow-confirmation"
              aria-labelledby="workflow-confirmation-title"
              onCancel={() => pendingRef.current?.(false)}
            >
              <h2 id="workflow-confirmation-title">Review agent action</h2>
              {confirmation ? (
                <>
                  <p>
                    <strong>{confirmation.title}</strong> ·{" "}
                    {confirmation.action}
                  </p>
                  <p>
                    Review the exact request before allowing this action.
                    ScopeDelta will recheck your access and the current record.
                  </p>
                  <dl className="workflow-review-fields">
                    {Object.entries(confirmation.details)
                      .filter(([key]) => key !== "data" && key !== "action")
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                  <pre aria-label="Proposed changes">
                    {JSON.stringify(
                      confirmation.details.data ?? confirmation.details,
                      null,
                      2,
                    )}
                  </pre>
                  <div className="workflow-actions">
                    <button
                      type="button"
                      onClick={() => pendingRef.current?.(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => pendingRef.current?.(true)}
                    >
                      Confirm action
                    </button>
                  </div>
                </>
              ) : null}
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
