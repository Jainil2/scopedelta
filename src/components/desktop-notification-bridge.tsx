"use client";

import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

type DesktopContext = {
  enabled: boolean;
  cursor: string | null;
};

type DesktopNotificationEvent = {
  id: string;
  category: "work_item_activity" | "client_activity";
  createdAt: string;
  path: string;
};

type NotificationFeed = {
  events: DesktopNotificationEvent[];
  cursor: string;
  hasMore: boolean;
};

const POLL_INTERVAL_MS = 60_000;
const MAX_PAGES_PER_POLL = 5;

function nativeAvailable() {
  return (
    typeof (
      globalThis as typeof globalThis & {
        __TAURI_INTERNALS__?: { invoke?: unknown };
      }
    ).__TAURI_INTERNALS__?.invoke === "function"
  );
}

function isFeed(value: unknown): value is NotificationFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Partial<NotificationFeed>;
  return (
    Array.isArray(feed.events) &&
    typeof feed.cursor === "string" &&
    feed.cursor.length > 0 &&
    typeof feed.hasMore === "boolean"
  );
}

async function pollDesktopNotifications(signal: AbortSignal) {
  const context = await invoke<DesktopContext>("remote_notification_context");
  if (!context.enabled) return;

  let cursor = context.cursor;
  let cursorResetAttempted = false;
  for (let page = 0; page < MAX_PAGES_PER_POLL; page += 1) {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/v1/desktop/notifications?${query}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (response.status === 400 && cursor && !cursorResetAttempted) {
      cursor = null;
      cursorResetAttempted = true;
      page -= 1;
      continue;
    }
    if (!response.ok) return;
    const body = (await response.json()) as { data?: unknown };
    if (!isFeed(body.data)) return;
    await invoke("remote_submit_notifications", {
      cursor: body.data.cursor,
      events: body.data.events,
    });
    cursor = body.data.cursor;
    if (!body.data.hasMore) return;
  }
}

export function DesktopNotificationBridge() {
  useEffect(() => {
    if (!nativeAvailable()) return;
    let controller: AbortController | null = null;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      void pollDesktopNotifications(controller.signal).catch(() => {
        // Desktop notification delivery is best-effort and never blocks the web app.
      });
    };
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    poll();

    return () => {
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  return null;
}
