import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (set in frontend/Dockerfile)
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  compress: true,
  // The two pages used to live under other addresses; old links and bookmarks still land.
  async redirects() {
    return [
      { source: "/:old(a\\w{4}pt)", destination: "/assistant", permanent: true },
      { source: "/:old(a\\w{4})", destination: "/", permanent: true },
    ];
  },
  experimental: {
    staleTimes: {
      dynamic: 3600,
      static: 3600,
    },
  },
};

export default nextConfig;
