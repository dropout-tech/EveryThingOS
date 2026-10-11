import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/workspace/reply", destination: "/workspace/chat", permanent: true },
      { source: "/workspace/funnel", destination: "/workspace/letter", permanent: true },
    ];
  },
};

export default nextConfig;
