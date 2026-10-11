import type { Metadata } from "next";
import { COMMERCIAL } from "./commercial";

/** Page metadata with its own share card; the share image comes from `app/opengraph-image.png`. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title}｜${COMMERCIAL.product}`, description, url: path, siteName: COMMERCIAL.product, locale: "zh_TW", type: "website" },
    twitter: { card: "summary_large_image", title: `${title}｜${COMMERCIAL.product}`, description },
  };
}
