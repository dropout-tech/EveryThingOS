import type { MetadataRoute } from "next";
import { COMMERCIAL } from "@/lib/commercial";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/workspace", "/platform", "/api", "/login", "/offline", "/q/"] },
    sitemap: `${COMMERCIAL.siteUrl}/sitemap.xml`,
  };
}
