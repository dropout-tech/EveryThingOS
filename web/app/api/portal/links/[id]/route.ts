import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { extendLink, parseDays, portalMode, PortalError, revokeLink, withUrls } from "@/lib/portal-server";
import { writeBlocked } from "@/lib/sources/config";
import { erpMethod, SourceError } from "@/lib/sources/erpnext";

/** Revoke a link, or set how many more days it stays open. Live only; demo links are changed in the browser. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/portal/links/[id]">) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const { id } = await ctx.params;
  if (!/^pl_[0-9a-f]{24}$/.test(id)) return refuse("找不到這個連結", 404);
  const body = await readJson<{ action?: unknown; days?: unknown }>(request);
  const mode = await portalMode();
  if (mode.mode !== "live") return refuse(mode.mode === "demo" ? "示範連結只存在這個瀏覽器裡" : mode.reason, 409);
  if (body?.action !== "revoke") {
    const blocked = writeBlocked(mode.config);
    if (blocked) return refuse(blocked, 423);
  }
  try {
    // The person must still be logged in to ERPNext; revoking keeps working when the contract is read-only.
    await erpMethod("frappe.auth.get_logged_user", {}, mode.config);
    if (body?.action === "revoke") {
      const [link] = await withUrls([await revokeLink(mode.config, id)], mode.site);
      return reply({ ok: true, link, message: `已撤回 ${link.docname} 的連結，客人再打開會看到「連結已收回」。` });
    }
    if (body?.action === "expiry") {
      const days = parseDays(body.days, undefined);
      if (!days) return refuse("有效天數要是 1 到 90 天");
      const [link] = await withUrls([await extendLink(mode.config, id, days)], mode.site);
      return reply({ ok: true, link, message: `${link.docname} 的連結改成 ${days} 天後到期。請重新複製網址傳給客人。` });
    }
    return refuse("只能撤回或改到期日");
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, error.kind === "login" ? 401 : 502);
    if (error instanceof PortalError) return refuse(error.message, error.status >= 500 ? 502 : error.status);
    return refuse(error instanceof Error ? error.message : String(error), 500);
  }
}
