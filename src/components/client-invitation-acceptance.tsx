"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

async function request<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init.headers,
  });
  const result = (await response.json()) as {
    data?: T;
    error?: { message: string };
  };
  if (!response.ok || !result.data) {
    throw new Error(
      result.error?.message ?? "The invitation could not be accepted.",
    );
  }
  return result.data;
}

export function ClientInvitationAcceptance({
  signedIn,
}: Readonly<{ signedIn: boolean }>) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"working" | "auth" | "error">("working");
  const [message, setMessage] = useState("Securing your client invitation…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function run() {
      try {
        const token = new URLSearchParams(window.location.hash.slice(1)).get(
          "token",
        );
        if (token) {
          await request("/api/v1/client/invitations/stage", {
            method: "POST",
            body: JSON.stringify({ token }),
          });
          history.replaceState(null, "", window.location.pathname);
        }
        if (!signedIn) {
          setState("auth");
          setMessage(
            "Sign in or create a verified account with the invited email address.",
          );
          return;
        }
        const accepted = await request<{ projectId: string }>(
          "/api/v1/client/invitations/accept",
          { method: "POST" },
        );
        router.push(`/client/projects/${accepted.projectId}`);
        router.refresh();
      } catch (error) {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "The invitation could not be accepted.",
        );
      }
    }
    void run();
  }, [router, signedIn]);

  return (
    <div className="invitation-state">
      <p className={state === "error" ? "client-alert error" : "client-alert"}>
        {message}
      </p>
      {state === "auth" ? (
        <div className="invitation-actions">
          <Link
            className="client-button primary"
            href="/sign-in?callbackURL=%2Fclient%2Finvitations%2Faccept"
          >
            Sign in
          </Link>
          <Link
            className="client-button secondary"
            href="/sign-up?callbackURL=%2Fclient%2Finvitations%2Faccept"
          >
            Create account
          </Link>
        </div>
      ) : null}
    </div>
  );
}
