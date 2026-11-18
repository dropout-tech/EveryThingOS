import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/workspace/reply", destination: "/workspace/chat", permanent: true },
      { source: "/workspace/funnel", destination: "/workspace/letter", permanent: true },
    ];
  },
};

export default (async () => {
  if (process.env.NODE_ENV === "development") {
    await initOpenNextCloudflareForDev({ remoteBindings: false, persist: true });
  }
  return nextConfig;
})();
