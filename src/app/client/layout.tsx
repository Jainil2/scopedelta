import type { Metadata } from "next";

import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";
import { WebMcpBridge } from "@/components/webmcp-bridge";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Client workspace — ScopeDelta",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return (
    <>
      <DesktopNotificationBridge />
      {session ? (
        <WebMcpBridge
          workspaceId=""
          userId={session.user.id}
          surface="client"
        />
      ) : null}
      {children}
    </>
  );
}
