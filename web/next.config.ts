import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["wrangler"],
  async redirects() {
    const home = "/workspace";
    const retired = (base: string) => [
      { source: base, destination: home, permanent: false },
      { source: `${base}/:path*`, destination: home, permanent: false },
    ];
    return [
      { source: "/workspace/reply", destination: home, permanent: false },
      { source: "/workspace/reply/:path*", destination: home, permanent: false },
      { source: "/workspace/funnel", destination: home, permanent: false },
      { source: "/workspace/funnel/:path*", destination: home, permanent: false },
      ...retired("/workspace/hr"),
      ...retired("/workspace/chat"),
      ...retired("/workspace/letter"),
    ];
  },
};

export default (async () => {
  if (process.env.NODE_ENV === "development") {
    await initOpenNextCloudflareForDev({ remoteBindings: false, persist: true });
  }
  return nextConfig;
})();
