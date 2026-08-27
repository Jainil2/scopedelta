import type { Metadata } from "next";

import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";

export const metadata: Metadata = {
  title: "Client workspace — ScopeDelta",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DesktopNotificationBridge />
      {children}
    </>
  );
}
