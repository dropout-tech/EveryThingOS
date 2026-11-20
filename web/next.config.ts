import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["wrangler"],
  async redirects() {
    return [
      { source: "/workspace/reply", destination: "/workspace", permanent: true },
      { source: "/workspace/funnel", destination: "/workspace", permanent: true },
    ];
  },
};

export default (async () => {
  if (process.env.NODE_ENV === "development") {
    await initOpenNextCloudflareForDev({ remoteBindings: false, persist: true });
  }
  return nextConfig;
})();
