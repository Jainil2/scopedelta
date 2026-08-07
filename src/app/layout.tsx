import type { Metadata } from "next";

import "./globals.css";

const localAppUrl = "http://localhost:3000";
const appUrl = process.env.APP_URL || localAppUrl;

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "ScopeDelta",
  description:
    "AI-assisted scope-change and change-order workflow for software agencies and freelancers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
