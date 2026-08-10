import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const clientHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      {
        key: "X-Robots-Tag",
        value: "noindex, nofollow, noarchive",
      },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/client/:path*", headers: clientHeaders },
      { source: "/api/v1/client/:path*", headers: clientHeaders },
    ];
  },
};

export default nextConfig;
