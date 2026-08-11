"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type ClientNotification = {
  id: string;
  projectId: string;
  projectName: string;
  kind:
    | "request_submitted"
    | "clarification_needed"
    | "discussion_added"
    | "packet_published"
    | "packet_actioned"
    | "acceptance_published"
    | "acceptance_actioned";
  readAt: string | Date | null;
  createdAt: string | Date;
};

export function ClientNotificationInbox({
  initialNotifications,
}: Readonly<{ initialNotifications: ClientNotification[] }>) {
  const [items, setItems] = useState(initialNotifications);
  const [pending, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      const response = await fetch(`/api/v1/client/notifications/${id}`, {
        method: "PATCH",
      });
      if (!response.ok) return;
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
    });
  }

  return (
    <section className="client-section" aria-labelledby="client-inbox-title">
      <div className="client-section-heading">
        <div>
          <p className="client-kicker">Durable inbox</p>
          <h1 id="client-inbox-title">Notifications</h1>
          <p>Project updates remain available here when email is disabled.</p>
        </div>
        <span>{items.filter((item) => !item.readAt).length} unread</span>
      </div>
      <div className="client-record-list">
        {items.map((item) => (
          <article key={item.id} className={item.readAt ? "" : "is-unread"}>
            <header>
              <div>
                <span className="client-chip">
                  {item.kind.replaceAll("_", " ")}
                </span>
                <h2>{item.projectName}</h2>
              </div>
              <time dateTime={new Date(item.createdAt).toISOString()}>
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </header>
            <div className="client-actions">
              <Link
                href={`/client/projects/${item.projectId}`}
                onClick={() => {
                  if (!item.readAt) markRead(item.id);
                }}
              >
                Open project
              </Link>
              {!item.readAt ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => markRead(item.id)}
                >
                  Mark read
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!items.length ? (
          <p className="client-empty">You are up to date.</p>
        ) : null}
      </div>
    </section>
  );
}
