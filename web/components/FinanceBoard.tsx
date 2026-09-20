"use client";

import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { demoKey, useDemoState } from "@/lib/demo-state";
import { collectOverdue, formatTwd, type AgingRow, type Books } from "@/lib/erp";

type FinanceBoardProps = {
  packId: string;
  books: Books;
};

export function FinanceBoard({ packId, books }: FinanceBoardProps) {
  const [aging, setAging] = useDemoState(demoKey("aging", packId), books.arAging);
  const [invoices, setInvoices] = useDemoState(demoKey("einvoices", packId), books.einvoices);
  const [note, setNote] = useState<string | null>(null);

  function onCollect(row: AgingRow) {
    const result = collectOverdue(row);
    if (!result.collected) {
      setNote(`${row.party} 沒有逾期，先對帳即可。`);
      return;
    }
    setAging((current) => current.map((item) => (item.party === row.party ? result.row : item)));
    setNote(`已收 ${row.party} ${formatTwd(result.collected)}。傳票自動拋轉，不必另開收款單。`);
  }

  function onUpload(no: string) {
    setInvoices((current) =>
      current.map((item) => (item.no === no ? { ...item, status: "已上傳" } : item)),
    );
    setNote(`${no} 已交給加值中心。我們不自研財政部連線。`);
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-cream-dim">
        進銷存單據自動拋轉傳票。稅額 5% 已含在單上。電子發票開立後交給加值中心上傳，不自研財政部連線。
      </p>
      <ActionNote>{note}</ActionNote>
      <section>
        <h3 className="text-lg">誰欠我們（帳齡）</h3>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--line)]">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-ink-2 text-cream-dim">
              <tr>
                <th className="px-4 py-3">客戶</th>
                <th className="px-4 py-3">未到期</th>
                <th className="px-4 py-3">30 天</th>
                <th className="px-4 py-3">60 天</th>
                <th className="px-4 py-3">90 天＋</th>
                <th className="px-4 py-3">下一步</th>
              </tr>
            </thead>
            <tbody>
              {aging.map((row) => (
                <tr key={row.party} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{row.party}</td>
                  <td className="px-4 py-3">{formatTwd(row.current)}</td>
                  <td className="px-4 py-3">{formatTwd(row.d30)}</td>
                  <td className={row.d60 ? "px-4 py-3 text-gold" : "px-4 py-3"}>{formatTwd(row.d60)}</td>
                  <td className={row.d90 ? "px-4 py-3 text-orange" : "px-4 py-3"}>{formatTwd(row.d90)}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onCollect(row)} className="text-teal">
                      {row.d90 || row.d60 ? "催收並入帳" : "對帳"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3>本月損益</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {books.pnl.map((row) => (
              <li key={row.label} className="flex justify-between">
                <span className="text-cream-dim">{row.label}</span>
                <span className={row.amount < 0 ? "text-orange" : "text-teal"}>{formatTwd(row.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3>自動傳票</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {books.journals.map((row) => (
              <li key={row.no}>
                <p>
                  {row.date} {row.no}
                </p>
                <p className="text-cream-dim">{row.memo}</p>
                <p className="text-xs">
                  借 {row.debit} ／ 貸 {row.credit} · {formatTwd(row.amount)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cream-dim">本期應納營業稅約 {formatTwd(books.vatPayable)}</p>
        </div>
      </section>
      <section>
        <h3 className="text-lg">電子發票</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {invoices.map((row) => (
            <li key={row.no} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-4 py-3">
              <span>
                {row.no} · 對應 {row.related}
              </span>
              <span className="flex items-center gap-3 text-teal">
                {row.status} · {formatTwd(row.amount)}
                {row.status !== "已上傳" ? (
                  <button type="button" onClick={() => onUpload(row.no)} className="text-xs underline">
                    上傳加值中心
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
