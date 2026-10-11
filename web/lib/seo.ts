import type { Metadata } from "next";
import { COMMERCIAL } from "./commercial";

/** Served by the `app/opengraph-image.png` file convention; a page-level `openGraph` replaces the inherited image, so it is repeated here. */
const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: `${COMMERCIAL.product}：客人、進銷存、帳、薪資，一個登入做完。` };

export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title}｜${COMMERCIAL.product}`, description, url: path, siteName: COMMERCIAL.product, locale: "zh_TW", type: "website", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title}｜${COMMERCIAL.product}`, description, images: [OG_IMAGE.url] },
  };
}
