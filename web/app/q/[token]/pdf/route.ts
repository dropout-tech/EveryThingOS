import type { NextRequest } from "next/server";
import { linkPdf, portalMode, PortalError, verifyToken } from "@/lib/portal-server";

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
}

/** The ERPNext print (frappe.utils.print_format.download_pdf), fetched by the glue with the company's integration key. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/q/[token]/pdf">) {
  const { token: raw } = await ctx.params;
  const mode = await portalMode();
  if (mode.mode !== "live") return plain("示範文件請用「列印／存成 PDF」。", 404);
  const token = await verifyToken(raw, { live: true, site: mode.site });
  if (token.mode === "invalid") return plain("這個連結無效。", 404);
  if (token.mode === "expired") return plain("這個連結已經過期。", 410);
  if (token.mode !== "live") return plain("這個連結無效。", 404);
  try {
    const res = await linkPdf(mode.config, token.linkId);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return plain(data.error ?? "PDF 現在產生不出來，請稍後再試。", res.status === 410 ? 410 : 502);
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="${token.docname.replace(/[^\w.-]+/g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return plain(error instanceof PortalError ? error.message : "PDF 現在產生不出來，請稍後再試。", 502);
  }
}
