import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { payLink, portalMode, PortalError, verifyToken } from "@/lib/portal-server";

/** Online payment for an invoice: ERPNext makes a Payment Request through ECPay/NewebPay and we send the customer there. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("請從發票頁面按「線上付款」", 403);
  const body = await readJson<{ token?: unknown }>(request);
  if (!body || typeof body.token !== "string") return refuse("連結不完整");
  const mode = await portalMode();
  if (mode.mode !== "live") return refuse(mode.mode === "demo" ? "示範發票不能真的付款" : "線上付款暫時不能用，請用轉帳", 409);
  const token = await verifyToken(body.token, { live: true, site: mode.site });
  if (token.mode === "invalid") return refuse("這個連結無效，請跟業務要一個新的", 404);
  if (token.mode === "expired") return refuse("這個連結已經過期，請跟業務要一個新的", 410);
  if (token.mode !== "live" || token.doctype !== "Sales Invoice") return refuse("只有發票可以線上付款");
  try {
    const out = await payLink(mode.config, token.linkId);
    if (out.status === "ok" && out.url) return reply({ ok: true, url: out.url });
    if (out.status === "paid") return reply({ ok: false, message: "這張發票已經付清了，謝謝。" });
    return reply({ ok: false, message: "這家公司還沒開線上付款，請用下面的轉帳資料付款。" });
  } catch (error) {
    if (error instanceof PortalError) return refuse(error.message, error.status >= 500 ? 502 : error.status);
    return refuse("現在連不上付款服務，請稍後再試", 502);
  }
}
