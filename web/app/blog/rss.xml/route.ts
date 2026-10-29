import { COMMERCIAL } from "@/lib/commercial";
import { listPosts } from "@/lib/blog";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function GET() {
  const posts = listPosts();
  const items = posts
    .map((post) => {
      const link = `${COMMERCIAL.siteUrl}/blog/${post.slug}`;
      const when = new Date(`${post.date}T08:00:00+08:00`).toUTCString();
      return `<item><title>${escapeXml(post.title)}</title><link>${link}</link><guid>${link}</guid><pubDate>${when}</pubDate><description>${escapeXml(post.description)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(COMMERCIAL.product)} 部落格</title><link>${COMMERCIAL.siteUrl}/blog</link><description>${escapeXml("只寫已經做在產品裡的事。")}</description>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
