import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const webMcpHeaders = [
      { key: "Origin-Agent-Cluster", value: "?1" },
      { key: "Permissions-Policy", value: "tools=(self)" },
    ];
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      {
        key: "X-Robots-Tag",
        value: "noindex, nofollow, noarchive",
      },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    return [
      { source: "/:path*", headers: webMcpHeaders },
      { source: "/app/:path*", headers: privateHeaders },
      { source: "/client/:path*", headers: privateHeaders },
      { source: "/api/v1/:path*", headers: privateHeaders },
      { source: "/invitations/:path*", headers: privateHeaders },
      { source: "/forgot-password", headers: privateHeaders },
      { source: "/reset-password", headers: privateHeaders },
      { source: "/verification-status", headers: privateHeaders },
      { source: "/sign-in", headers: privateHeaders },
      { source: "/sign-up", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
