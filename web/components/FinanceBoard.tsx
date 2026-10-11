"use client";

import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { EmptyState } from "./EmptyState";
import { Section } from "./ModuleFrame";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { Money } from "./ui/Money";
import { demoKey, useBoardState } from "@/lib/demo-state";
import { collectOverdue, formatTwd, type AgingRow, type Books } from "@/lib/erp";
import { formatTwdShort } from "@/lib/format";

const INVOICE_TONE = (status: string) => (status === "已上傳" ? "ok" : status === "失敗" ? "danger" : "warn");

type FinanceBoardProps = {
  packId: string;
  books: Books;
  live?: boolean;
};

export function FinanceBoard({ packId, books, live = false }: FinanceBoardProps) {
  const [aging, setAging] = useBoardState(demoKey("aging", packId), books.arAging, live);
  const [invoices, setInvoices] = useBoardState(demoKey("einvoices", packId), books.einvoices, live);
  const [note, setNote] = useState<string | null>(null);

  function onCollect(row: AgingRow) {
    const result = collectOverdue(row);
    if (!result.collected) {
      setNote(`${row.party} 沒有逾期，先對帳即可。`);
      return;
    }
    setAging((current) => current.map((item) => (item.party === row.party ? result.row : item)));
    setNote(`已收 ${row.party} ${formatTwd(result.collected)}。開單就入帳，不必另開一張收款單。`);
  }

  function onUpload(no: string) {
    setInvoices((current) =>
      current.map((item) => (item.no === no ? { ...item, status: "已上傳" } : item)),
    );
    setNote(`${no} 已交給加值中心上傳。`);
  }

  const total = aging.reduce((sum, row) => sum + row.current + row.d30 + row.d60 + row.d90, 0);
  const late = aging.reduce((sum, row) => sum + row.d60 + row.d90, 0);
  const sum = (key: "current" | "d30" | "d60" | "d90") => aging.reduce((n, row) => n + row[key], 0);

  return (
    <div className="space-y-8">
      <ActionNote>{note}</ActionNote>
      <ul className="kpi-grid lg:!grid-cols-3" aria-label="帳款摘要">
        <li className="kpi">
          <span className="kpi-label">還沒收的錢</span>
          <span className="kpi-value" title={formatTwd(total)}>{formatTwdShort(total)}</span>
          <span className="kpi-note">{aging.length} 位客人</span>
        </li>
        <li className="kpi">
          <span className="kpi-label">超過 60 天</span>
          <span className="kpi-value" title={formatTwd(late)}>{formatTwdShort(late)}</span>
          <span className="kpi-note" data-tone={late ? "warn" : undefined}>{late ? "先催這些" : "沒有拖很久的"}</span>
        </li>
        <li className="kpi col-span-2 lg:col-span-1">
          <span className="kpi-label">本期營業稅（約）</span>
          <span className="kpi-value" title={formatTwd(books.vatPayable)}>{formatTwdShort(books.vatPayable)}</span>
          <span className="kpi-note">銷項 5% 減進項，開單就入帳</span>
        </li>
      </ul>
      <Section id="aging" title="誰欠我們（帳齡）" aside="超過 60 天標橘、90 天標紅">
        <div className="glass">
          <div className="sm:overflow-x-auto">
            <table className="table-stack sm:min-w-[40rem]">
              <thead className="bg-ink-2">
                <tr>
                  <th scope="col">客戶</th>
                  <th scope="col" className="num" data-numeric="">未到期</th>
                  <th scope="col" className="num" data-numeric="">30 天</th>
                  <th scope="col" className="num" data-numeric="">60 天</th>
                  <th scope="col" className="num" data-numeric="">90 天＋</th>
                  <th scope="col" className="text-right">下一步</th>
                </tr>
              </thead>
              <tbody>
                {live && !aging.length ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-cream-dim">
                      沒有人欠款
                    </td>
                  </tr>
                ) : null}
                {aging.map((row) => (
                  <tr key={row.party}>
                    <td data-primary="">{row.party}</td>
                    <td data-label="未到期" className="num" data-numeric="">
                      <Money amount={row.current} />
                    </td>
                    <td data-label="30 天" className="num" data-numeric="">
                      <Money amount={row.d30} />
                    </td>
                    <td data-label="60 天" className="num" data-numeric="">
                      <Money amount={row.d60} tone={row.d60 ? "warn" : "none"} className={row.d60 ? "font-medium" : ""} />
                    </td>
                    <td data-label="90 天＋" className="num" data-numeric="">
                      <Money amount={row.d90} tone={row.d90 ? "danger" : "none"} className={row.d90 ? "font-medium" : ""} />
                    </td>
                    <td data-label="下一步" className="sm:text-right">
                      {live ? (
                        <DeskLink href={row.href} className={buttonClass({ variant: row.d90 || row.d60 ? "primary" : "secondary", size: "sm" })}>
                          {row.d90 || row.d60 ? "催收" : "對帳"}
                        </DeskLink>
                      ) : (
                        <button type="button" onClick={() => onCollect(row)} className={buttonClass({ variant: row.d90 || row.d60 ? "primary" : "secondary", size: "sm" })}>
                          {row.d90 || row.d60 ? "催收並入帳" : "對帳"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {aging.length > 1 ? (
                <tfoot>
                  <tr>
                    <td data-primary="">合計</td>
                    <td data-label="未到期" className="num" data-numeric="">
                      <Money amount={sum("current")} />
                    </td>
                    <td data-label="30 天" className="num" data-numeric="">
                      <Money amount={sum("d30")} />
                    </td>
                    <td data-label="60 天" className="num" data-numeric="">
                      <Money amount={sum("d60")} />
                    </td>
                    <td data-label="90 天＋" className="num" data-numeric="">
                      <Money amount={sum("d90")} />
                    </td>
                    <td aria-hidden="true" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </Section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title">本月損益</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {books.pnl.map((row, index) => {
              const last = index === books.pnl.length - 1;
              return (
                <li key={row.label} className={`flex justify-between gap-4 ${last ? "border-t border-[var(--line)] pt-2 text-base" : ""}`}>
                  <span className={last ? "font-medium" : "text-cream-dim"}>{row.label}</span>
                  <Money amount={row.amount} className="font-medium" />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card">
          <h2 className="section-title">自動入帳</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {books.journals.map((row) => (
              <li key={row.no}>
                <p>
                  {row.date} <DeskLink href={row.href} className="hover:underline">{row.no}</DeskLink>
                </p>
                <p className="text-cream-dim">{row.memo}</p>
                <p className="flex flex-wrap justify-between gap-x-3 text-xs">
                  <span>
                    借 {row.debit} ／ 貸 {row.credit}
                  </span>
                  <Money amount={row.amount} />
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cream-dim">開單就入帳，不用另外做傳票。</p>
        </div>
      </section>
      <Section id="einvoice" title="電子發票" aside="開好後交給加值中心上傳">
        <ul className="space-y-2 text-sm">
          {live && !invoices.length ? (
            <li>
              <EmptyState compact title="還沒有電子發票" detail="收款前開立發票時，系統會配號並交給加值中心上傳。" action={{ href: "/workspace/erp/sales", label: "到生意開發票" }} help="module-finance" />
            </li>
          ) : null}
          {invoices.map((row) => (
            <li key={row.related} className="glass-chip flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                {row.no} · 對應 {row.related}
                {row.error ? <span className="block text-xs text-danger">{row.error}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <Badge tone={INVOICE_TONE(row.status)}>{row.status}</Badge>
                <Money amount={row.amount} />
                {live ? (
                  <DeskLink href={row.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                    打開
                  </DeskLink>
                ) : row.status !== "已上傳" ? (
                  <button type="button" onClick={() => onUpload(row.no)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                    上傳加值中心
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
