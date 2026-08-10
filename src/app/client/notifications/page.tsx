import Link from "next/link";

import { ClientNotificationInbox } from "@/components/client-notification-inbox";
import { requireSession } from "@/lib/session";
import { listClientNotifications } from "@/server/client-collaboration";
import { listWorkspaces } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export default async function ClientNotificationsPage() {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const [notifications, workspaces] = await Promise.all([
    listClientNotifications(actor, 1, 100),
    listWorkspaces(actor),
  ]);
  return (
    <main className="client-shell client-index">
      <header className="client-topbar">
        <Link className="client-wordmark" href="/client">
          ScopeDelta <span>client</span>
        </Link>
        <nav aria-label="Client navigation">
          <Link href="/client">Projects</Link>
          {workspaces.length ? <Link href="/app">Team workspace</Link> : null}
        </nav>
      </header>
      <ClientNotificationInbox initialNotifications={notifications} />
    </main>
  );
}
