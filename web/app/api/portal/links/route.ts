import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { DEFAULT_DAYS, type PortalLink } from "@/lib/portal";
import { createLink, demoLinkId, isPortalDoctype, parseDays, portalMode, PortalError, requestOrigin, signDemo, signLive, type DemoSnapshot } from "@/lib/portal-server";
import { writeBlocked } from "@/lib/sources/config";
import { erpMethod, SourceError } from "@/lib/sources/erpnext";

type Body = { doctype?: unknown; docname?: unknown; days?: unknown; demo?: Partial<DemoSnapshot>; demoId?: unknown };

const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 422 };

function demoSnapshot(d: Partial<DemoSnapshot> | undefined): DemoSnapshot | null {
  if (!d || !isPortalDoctype(d.doctype)) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const docname = text(d.docname, 40);
  const party = text(d.party, 40);
  const item = text(d.item, 40);
  const qty = Number(d.qty);
  const amount = Number(d.amount);
  const tax = Number(d.tax);
  if (!docname || !party || !item) return null;
  if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) return null;
  if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000 || !Number.isFinite(tax) || tax < 0 || tax > amount) return null;
  const status = d.status && ["open", "unpaid", "overdue", "paid"].includes(d.status) ? d.status : "open";
  return { doctype: d.doctype, docname, party, item, qty, amount: Math.round(amount), tax: Math.round(tax), status };
}

/** Makes a share link. Live: ERPNext checks the salesperson may read the document, the glue keeps the link. Demo: a signed snapshot. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const body = await readJson<Body>(request);
  if (!body) return refuse("看不懂這個請求");
  const days = parseDays(body.days, DEFAULT_DAYS);
  if (!days) return refuse("有效天數要是 1 到 90 天");
  const mode = await portalMode();

  if (mode.mode === "demo") {
    const snapshot = demoSnapshot(body.demo);
    if (!snapshot) return refuse("示範單據的內容不完整");
    const now = Date.now();
    const expiresAt = new Date(now + days * 86_400_000).toISOString();
    // Re-signing an existing demo link (new expiry) keeps its id, so views and the signature stay with it.
    const id = typeof body.demoId === "string" && /^demo_[0-9a-f]{24}$/.test(body.demoId) ? body.demoId : demoLinkId();
    const url = `${await requestOrigin()}/q/${await signDemo(snapshot, id, expiresAt)}`;
    const link: PortalLink = {
      id,
      doctype: snapshot.doctype,
      docname: snapshot.docname,
      party: snapshot.party,
      amount: snapshot.amount + snapshot.tax,
      createdBy: "示範",
      createdAt: new Date(now).toISOString(),
      expiresAt,
      revokedAt: null,
      firstViewedAt: null,
      lastViewedAt: null,
      viewCount: 0,
      acceptedAt: null,
      acceptedName: null,
      state: "active",
      url,
      demo: true,
    };
    return reply({ ok: true, link });
  }
  if (mode.mode === "unconfigured") return refuse(mode.reason, 409);

  const blocked = writeBlocked(mode.config);
  if (blocked) return refuse(blocked, 423);
  if (!isPortalDoctype(body.doctype)) return refuse("只能分享報價單、訂單或發票");
  const docname = typeof body.docname === "string" ? body.docname.trim() : "";
  if (!docname || docname.length > 140) return refuse("缺少單號");

  try {
    const doc = await erpMethod<{ customer: string; total: number }>("dropout_core.portal.document", { doctype: body.doctype, name: docname }, mode.config);
    const link = await createLink(mode.config, { doctype: body.doctype, docname, party: (doc.customer ?? "").slice(0, 140), amount: Number(doc.total) || 0, days });
    return reply({ ok: true, link: { ...link, url: `${await requestOrigin()}/q/${await signLive(mode.site, link)}` } });
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
    if (error instanceof PortalError) return refuse(error.message, error.status >= 500 ? 502 : error.status);
    return refuse(error instanceof Error ? error.message : String(error), 500);
  }
}
