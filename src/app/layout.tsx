import type { Metadata } from "next";

import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const localAppUrl = "http://localhost:3000";
const appUrl = process.env.APP_URL || localAppUrl;

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "ScopeDelta — Turn scope creep into billable work",
  description:
    "Help your software agency spot scope changes, review what is billable, and move toward a clear change order before margin disappears.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
