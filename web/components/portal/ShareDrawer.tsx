"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClass } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Field } from "../ui/Field";
import { Money } from "../ui/Money";
import { demoKey, peekDemoState, writeDemoState } from "@/lib/demo-state";
import type { SalesDoc } from "@/lib/erp";
import { DEFAULT_DAYS, EXPIRY_CHOICES, KIND_LABEL, KIND_OF, lineShareUrl, shareableDoctype, shareText, dayText, type PortalLink } from "@/lib/portal";

export function demoLinksKey(packId: string) {
  return demoKey("portal", packId);
}

/** Demo links keep the practice card they were made from, so a new expiry can be signed for the same link. */
export type DemoLink = PortalLink & { source: SalesDoc };

export function saveDemoLink(packId: string, link: PortalLink, source: SalesDoc) {
  const key = demoLinksKey(packId);
  const current = peekDemoState<DemoLink[]>(key, []);
  writeDemoState(key, [{ ...link, source }, ...current.filter((l) => l.id !== link.id)].slice(0, 100));
}

function demoStatus(doc: SalesDoc) {
  if (doc.step === "paid") return "paid";
  if (doc.step === "invoice") return doc.overdueDays ? "overdue" : "unpaid";
  return "open";
}

type Created = { ok: boolean; message?: string; link?: PortalLink };

/** Asks the shell for a link: live goes through ERPNext and the glue, demo signs a snapshot of the practice card. */
export async function requestLink(doc: SalesDoc, days: number, live: boolean, demoId?: string): Promise<Created> {
  const doctype = shareableDoctype(doc);
  if (!doctype) return { ok: false, message: "出貨單不給客人看；請分享訂單或發票。" };
  const body = live
    ? { doctype, docname: doc.no, days }
    : { days, demoId, demo: { doctype, docname: doc.no, party: doc.party, item: doc.item, qty: doc.qty, amount: doc.amount, tax: doc.tax, status: demoStatus(doc) } };
  try {
    const res = await fetch("/api/portal/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = (await res.json().catch(() => ({ ok: false, message: `回應 ${res.status}` }))) as Created;
    if (res.status === 401) return { ok: false, message: "登入已過期，請重新登入後再試。" };
    return out;
  } catch {
    return { ok: false, message: "連不到 DropOut OS，請檢查網路後再試一次。" };
  }
}

export function CopyLink({ url, className }: { url: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className ?? buttonClass({ variant: "secondary" })}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* the URL is in the box above to copy by hand */
        }
      }}
    >
      {done ? "已複製" : "複製連結"}
    </button>
  );
}

export function LineShare({ url, company, link, className }: { url: string; company?: string | null; link: Pick<PortalLink, "doctype" | "docname">; className?: string }) {
  return (
    <a href={lineShareUrl(shareText({ company, doctype: link.doctype, docname: link.docname, url }))} target="_blank" rel="noopener noreferrer" className={className ?? buttonClass({ variant: "primary" })}>
      用 LINE 傳
    </a>
  );
}

/** 「傳給客人」: make a link for one quote, order or invoice, then copy it or send it over LINE. */
export function ShareDrawer({ doc, onClose, live, packId, company }: { doc: SalesDoc | null; onClose: () => void; live: boolean; packId: string; company?: string | null }) {
  const router = useRouter();
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<PortalLink | null>(null);
  const [forNo, setForNo] = useState<string | null>(null);
  if ((doc?.no ?? null) !== forNo) {
    setForNo(doc?.no ?? null);
    setLink(null);
    setError(null);
  }
  const doctype = doc ? shareableDoctype(doc) : null;
  const kind = doctype ? KIND_LABEL[KIND_OF[doctype]] : "單";

  async function create() {
    if (!doc) return;
    setPending(true);
    setError(null);
    const out = await requestLink(doc, days, live);
    setPending(false);
    if (!out.ok || !out.link?.url) {
      setError(out.message ?? "沒有做出連結，請再試一次。");
      return;
    }
    if (!live) saveDemoLink(packId, out.link, doc);
    else router.refresh();
    setLink(out.link);
  }

  return (
    <Drawer
      open={Boolean(doc)}
      title={doc ? `把${kind}傳給 ${doc.party}` : ""}
      onClose={onClose}
      footer={
        doc && doctype ? (
          link?.url ? (
            <>
              <LineShare url={link.url} company={company} link={link} />
              <CopyLink url={link.url} />
            </>
          ) : (
            <Button variant="primary" pending={pending} pendingLabel="做連結中…" onClick={create}>
              做分享連結
            </Button>
          )
        ) : null
      }
    >
      {doc ? (
        doctype ? (
          <div className="space-y-4">
            <dl>
              <dt>單號</dt>
              <dd className="num">{doc.no}</dd>
              <dt>含稅</dt>
              <dd>
                <Money amount={doc.amount + doc.tax} />
              </dd>
            </dl>
            {link?.url ? (
              <div className="space-y-2">
                <Field label="分享連結" hint={`${dayText(link.expiresAt)} 到期。客人打開、簽名，你都會在「客戶入口」看到。`}>
                  <input readOnly value={link.url} className="field num text-xs" onFocus={(event) => event.currentTarget.select()} />
                </Field>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-2">
                  先自己看看客人會看到什麼
                </a>
                {!live ? <p className="text-xs text-cream-dim">示範連結：客人那頁會標「示範」，簽了也不會送到任何公司。</p> : null}
              </div>
            ) : (
              <>
                <p className="text-sm text-cream-dim">
                  客人用手機打開就能看{kind}明細{doctype === "Quotation" ? "，確認後直接簽名接受" : doctype === "Sales Invoice" ? "、下載 PDF、看付款方式" : ""}。不用註冊、不用下載。
                </p>
                <Field label="連結幾天後失效" hint="過期或撤回後，客人就打不開了。">
                  <select className="field" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                    {EXPIRY_CHOICES.map((d) => (
                      <option key={d} value={d}>
                        {d} 天
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-cream-dim">出貨單是給倉庫和司機的，不給客人看。等開了發票，再從「請他付錢」那一欄傳給客人。</p>
        )
      ) : null}
    </Drawer>
  );
}
