import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { glueAdmin, platformOperator } from "@/lib/platform";

type Body =
  | { action: "create"; site: string }
  | { action: "paid"; id: string; reference: string }
  | { action: "void"; id: string; reason?: string }
  | { action: "resend" | "einvoice"; id: string };

/** DropOut staff only: open, mark paid offline, void, resend the link, or retry the e-invoice for one renewal invoice. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const operator = await platformOperator();
  if (!operator) return refuse("只有 DropOut 營運人員可以做這件事", 403);
  const body = await readJson<Body>(request);
  if (!body?.action) return refuse("缺少內容");
  if (body.action === "create") {
    const res = await glueAdmin<{ created: boolean; invoice: { id: string } }>(`/admin/accounts/${encodeURIComponent(body.site)}/invoices`, { method: "POST" });
    if (!res.ok || !res.data) return refuse(res.text || `回應 ${res.status}`, res.status === 409 ? 409 : 502);
    return reply({ ok: true, message: res.data.created ? `已開帳單 ${res.data.invoice.id}` : `這期已經有帳單 ${res.data.invoice.id}` });
  }
  if (!["paid", "void", "resend", "einvoice"].includes(body.action) || !body.id) return refuse("缺少內容");
  const res = await glueAdmin<{ ok: boolean; message?: string; pay_url?: string }>(`/admin/invoices/${encodeURIComponent(body.id)}/${body.action}`, {
    method: "POST",
    body: body.action === "paid" ? { reference: body.reference } : body.action === "void" ? { reason: body.reason } : {},
  });
  if (!res.ok || !res.data) return refuse(res.text || `回應 ${res.status}`, res.status === 409 || res.status === 400 ? res.status : 502);
  return reply({ ok: res.data.ok, message: res.data.message ?? "已更新", href: res.data.pay_url });
}
