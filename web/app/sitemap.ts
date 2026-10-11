import type { MetadataRoute } from "next";
import { COMMERCIAL } from "@/lib/commercial";
import { listIndustries } from "@/lib/industries";
import { LEGAL_LINKS, LEGAL_VERSION } from "@/lib/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${COMMERCIAL.siteUrl}${path}`;
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/pricing"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/consulting"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/saas"), changeFrequency: "monthly", priority: 0.7 },
    { url: url("/industries"), changeFrequency: "monthly", priority: 0.7 },
    ...listIndustries().map((i) => ({ url: url(`/industries/${i.id}`), changeFrequency: "monthly" as const, priority: 0.4 })),
    ...LEGAL_LINKS.map((l) => ({ url: url(l.href), lastModified: LEGAL_VERSION, changeFrequency: "yearly" as const, priority: 0.3 })),
    { url: url("/status"), changeFrequency: "always", priority: 0.3 },
  ];
}
