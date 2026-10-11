import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../ui/Badge";
import { buttonClass } from "../ui/Button";
import { Money } from "../ui/Money";
import { DemoGate } from "./DemoGate";
import { AcceptedReceipt, DocStatusBadge, PortalAccept } from "./PortalAccept";
import { PortalPay } from "./PortalPay";
import { PrintButtonClient } from "./PrintButtonClient";
import { formatNumber } from "@/lib/format";
import { dayText, KIND_LABEL, type PortalDoc, type PortalStatus } from "@/lib/portal";

const STATUS: Record<PortalStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "等你確認", tone: "warn" },
  accepted: { label: "已接受", tone: "ok" },
  ordered: { label: "已成立訂單", tone: "ok" },
  lost: { label: "已失效", tone: "neutral" },
  expired: { label: "已過期", tone: "danger" },
  cancelled: { label: "已取消", tone: "neutral" },
  paid: { label: "已付清", tone: "ok" },
  unpaid: { label: "待付款", tone: "warn" },
  overdue: { label: "已過付款期限", tone: "danger" },
  closed: { label: "已完成", tone: "ok" },
};

function initials(name: string) {
  const clean = name.replace(/(股份)?有限公司|企業社|工作室|商行/g, "").trim() || name;
  return /^[\x00-\x7f]/.test(clean) ? clean.slice(0, 2).toUpperCase() : clean.slice(0, 1);
}

/** Short wrapper used by every state of the public page: company header, then content, then a quiet footer. */
export function PortalFrame({ company, demo, children }: { company?: PortalDoc["company"] | null; demo: boolean; children: ReactNode }) {
  return (
    <main id="main" className="portal-page site-print mx-auto w-full max-w-3xl space-y-4 px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
      {demo ? (
        <p className="portal-demo" role="note">
          <Badge tone="demo">示範</Badge>
          <span>這是 DropOut OS 的示範頁面，不是真的報價或發票；簽名不會送到任何公司，也請不要轉帳。</span>
        </p>
      ) : null}
      {company ? (
        <header className="flex items-center gap-3">
          {company.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo} alt="" className="portal-logo" referrerPolicy="no-referrer" />
          ) : (
            <span className="portal-logo portal-monogram" aria-hidden="true">
              {initials(company.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-medium">{company.name}</p>
            {company.taxId ? <p className="text-xs text-cream-dim">統一編號 {company.taxId}</p> : null}
          </div>
        </header>
      ) : null}
      {children}
      <footer className="pt-6 text-center text-xs text-cream-dim site-noprint">這個頁面只給收到連結的人看。由 DropOut OS 提供。</footer>
    </main>
  );
}

function Meta({ doc }: { doc: PortalDoc }) {
  const rows: [string, string][] = [
    ["客戶", doc.customer],
    ["日期", dayText(doc.date)],
  ];
  if (doc.validTill) rows.push(["有效到", dayText(doc.validTill)]);
  if (doc.deliveryDate) rows.push(["預計交期", dayText(doc.deliveryDate)]);
  if (doc.dueDate) rows.push(["付款期限", dayText(doc.dueDate)]);
  if (doc.einvoice) rows.push(["電子發票", doc.einvoice]);
  return (
    <dl className="portal-meta">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function taxLabel(net: number, tax: number) {
  if (net > 0 && Math.abs(tax - net * 0.05) <= 1) return "營業稅 5%";
  return "營業稅";
}

export function PortalDocument({ doc, token, demo, linkId, pdfHref }: { doc: PortalDoc; token: string; demo: boolean; linkId: string; pdfHref: string | null }) {
  const status = STATUS[doc.status];
  const kind = KIND_LABEL[doc.kind];
  const contactName = doc.contact?.name ?? null;

  const body = (
    <>
      <article className="glass glass-hero space-y-5 p-5 md:p-7" aria-labelledby="doc-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker text-xs text-cream-dim">
              {kind} <span className="num">{doc.name}</span>
            </p>
            <h1 id="doc-title" className="page-title mt-1">
              給 {doc.customer} 的{kind}
            </h1>
          </div>
          {doc.status === "open" && doc.kind === "quote" ? (
            <DocStatusBadge linkId={linkId} demo={demo} label={status.label} tone={status.tone} />
          ) : (
            <Badge tone={status.tone}>{status.label}</Badge>
          )}
        </div>
        <Meta doc={doc} />

        <div className="portal-lines">
          <table className="table-stack">
            <thead>
              <tr>
                <th scope="col">品項</th>
                <th scope="col" className="num" data-numeric="">
                  數量
                </th>
                <th scope="col" className="num" data-numeric="">
                  單價
                </th>
                <th scope="col" className="num" data-numeric="">
                  金額
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={`${i}-${line.item}`}>
                  <td data-label="品項" data-primary="">
                    <span className="block">{line.item}</span>
                    {line.description ? <span className="block text-xs font-normal whitespace-pre-line text-cream-dim">{line.description}</span> : null}
                  </td>
                  <td data-label="數量" className="num" data-numeric="">
                    {formatNumber(line.qty)}
                    {line.uom ? ` ${line.uom}` : ""}
                  </td>
                  <td data-label="單價" className="num" data-numeric="">
                    <Money amount={line.rate} />
                  </td>
                  <td data-label="金額" className="num" data-numeric="">
                    <Money amount={line.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="portal-totals">
          <dt>未稅</dt>
          <dd>
            <Money amount={doc.net} />
          </dd>
          <dt>{taxLabel(doc.net, doc.tax)}</dt>
          <dd>
            <Money amount={doc.tax} />
          </dd>
          <dt className="portal-grand">含稅合計</dt>
          <dd className="portal-grand">
            <Money amount={doc.total} />
          </dd>
        </dl>
        {doc.currency && doc.currency !== "TWD" ? <p className="text-xs text-cream-dim">幣別：{doc.currency}</p> : null}
      </article>

      {doc.kind === "quote" ? <QuoteAction doc={doc} token={token} demo={demo} linkId={linkId} /> : null}

      {doc.kind === "invoice" ? (
        doc.status === "paid" ? (
          <section className="glass flex items-center gap-3 p-5" role="status">
            <span className="portal-check" aria-hidden="true">
              ✓
            </span>
            <p>這張發票已經付清了，謝謝！</p>
          </section>
        ) : doc.status === "cancelled" ? null : (
          <PortalPay token={token} outstanding={doc.outstanding ?? doc.total} bank={doc.bank} onlinePay={doc.onlinePay} demo={demo} contactName={contactName} />
        )
      ) : null}

      <div className="flex flex-wrap gap-2 site-noprint">
        {pdfHref ? (
          <a href={pdfHref} className={buttonClass({ variant: "secondary" })} download>
            下載 PDF
          </a>
        ) : null}
        <PrintButtonClient />
      </div>

      {doc.terms ? (
        <section className="glass-well space-y-2 p-5" aria-labelledby="terms-title">
          <h2 id="terms-title" className="section-title">
            條款與說明
          </h2>
          <p className="text-sm whitespace-pre-line text-cream-dim">{doc.terms}</p>
        </section>
      ) : null}

      {doc.contact || doc.company.phone || doc.company.email ? (
        <section className="glass-well space-y-2 p-5" aria-labelledby="contact-title">
          <h2 id="contact-title" className="section-title">
            有問題找誰
          </h2>
          <ul className="space-y-1 text-sm">
            {doc.contact?.name ? <li className="font-medium">{doc.contact.name}</li> : null}
            {doc.contact?.phone || doc.company.phone ? (
              <li>
                電話{" "}
                <a className="underline underline-offset-2" href={`tel:${(doc.contact?.phone ?? doc.company.phone)!.replace(/[^\d+]/g, "")}`}>
                  {doc.contact?.phone ?? doc.company.phone}
                </a>
              </li>
            ) : null}
            {doc.contact?.email || doc.company.email ? (
              <li>
                Email{" "}
                <a className="underline underline-offset-2 break-all" href={`mailto:${doc.contact?.email ?? doc.company.email}`}>
                  {doc.contact?.email ?? doc.company.email}
                </a>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </>
  );

  return (
    <PortalFrame company={doc.company} demo={demo}>
      {demo ? (
        <DemoGate
          linkId={linkId}
          revoked={
            <section className="glass glass-hero space-y-2 p-6 md:p-8" role="status">
              <h1 className="page-title">這個連結已經收回</h1>
              <p className="text-sm text-cream-dim">示範：業務在「客戶入口」撤回了這個連結。</p>
            </section>
          }
        >
          {body}
        </DemoGate>
      ) : (
        body
      )}
    </PortalFrame>
  );
}

function QuoteAction({ doc, token, demo, linkId }: { doc: PortalDoc; token: string; demo: boolean; linkId: string }) {
  if (doc.status === "open") return <PortalAccept token={token} docname={doc.name} total={doc.total} customer={doc.customer} demo={demo} linkId={linkId} />;
  if (doc.status === "accepted" && doc.accepted) return <AcceptedReceipt docname={doc.name} total={doc.total} customer={doc.customer} accepted={doc.accepted} demo={demo} />;
  const text =
    doc.status === "expired"
      ? "這張報價已經過期，不能再線上接受。請聯絡業務更新報價。"
      : doc.status === "ordered"
        ? "這張報價已經成立訂單了，謝謝！"
        : "這張報價已經失效，不能再線上接受。";
  return (
    <section className="glass p-5" role="status">
      <p>{text}</p>
    </section>
  );
}
