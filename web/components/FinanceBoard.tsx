"use client";

import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { NextThing } from "./NextThing";
import { EmptyState } from "./EmptyState";
import { buttonClass } from "./ui/Button";
import { demoKey, useBoardState } from "@/lib/demo-state";
import { collectOverdue, formatTwd, type AgingRow, type Books } from "@/lib/erp";
import { nextAging } from "@/lib/next-thing";

type FinanceBoardProps = {
  packId: string;
  books: Books;
  live?: boolean;
};

export function FinanceBoard({ packId, books, live = false }: FinanceBoardProps) {
  const [aging, setAging] = useBoardState(demoKey("aging", packId), books.arAging, live);
  const [invoices, setInvoices] = useBoardState(demoKey("einvoices", packId), books.einvoices, live);
  const [note, setNote] = useState<string | null>(null);
  const [reconciled, setReconciled] = useBoardState<string[]>(demoKey("recon", packId), [], live);
  const focus = nextAging(aging);
  const pendingInvoice = invoices.find((row) => row.status !== "已上傳");

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

  return (
    <div className="space-y-8">
      <p className="text-sm text-cream-dim">
        開單就入帳。要開發票的單才加 5% 營業稅，未稅報價的稅額是 0。電子發票開好後交給加值中心上傳。
      </p>
      <ActionNote>{note}</ActionNote>
      {focus ? (
        <NextThing
          title={`${focus.party} 逾期未付`}
          detail={`60 天 ${formatTwd(focus.d60)}，90 天以上 ${formatTwd(focus.d90)}。先收這一位，其餘在下面。`}
          action={
            live ? (
              <DeskLink href={focus.href} className={buttonClass({ variant: "primary" })}>
                催收
              </DeskLink>
            ) : (
              <button type="button" onClick={() => onCollect(focus)} className={buttonClass({ variant: "primary" })}>
                催收並入帳
              </button>
            )
          }
        />
      ) : pendingInvoice ? (
        <NextThing
          title={`${pendingInvoice.no} 還沒上傳`}
          detail="發票已經開了，還沒交給加值中心。帳上的這一步做完，今天就少一件卡住的事。"
          action={
            live ? (
              <DeskLink href={pendingInvoice.href} className={buttonClass({ variant: "primary" })}>
                打開發票
              </DeskLink>
            ) : (
              <button type="button" onClick={() => onUpload(pendingInvoice.no)} className={buttonClass({ variant: "primary" })}>
                上傳加值中心
              </button>
            )
          }
        />
      ) : null}
      {books.deposits?.length ? (
        <section>
          <h2 className="text-lg font-medium">訂金與押金</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {books.deposits.map((row) => (
              <li key={`${row.party}-${row.held}`} className="glass-chip px-4 py-3">
                {row.party} · 留下 {formatTwd(row.held)}
                <span className="mt-1 block text-xs text-cream-dim">{row.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="text-lg font-medium">誰欠我們（帳齡）</h2>
        <div className="glass mt-3 sm:overflow-x-auto">
          <table className="table-stack sm:min-w-[40rem]">
            <thead className="bg-ink-2">
              <tr>
                <th scope="col">客戶</th>
                <th scope="col">未到期</th>
                <th scope="col">30 天</th>
                <th scope="col">60 天</th>
                <th scope="col">90 天＋</th>
                <th scope="col">下一步</th>
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
                  <td data-label="未到期">{formatTwd(row.current)}</td>
                  <td data-label="30 天">{formatTwd(row.d30)}</td>
                  <td data-label="60 天" className={row.d60 ? "font-medium text-warn" : ""}>{formatTwd(row.d60)}</td>
                  <td data-label="90 天＋" className={row.d90 ? "font-medium text-danger" : ""}>{formatTwd(row.d90)}</td>
                  <td data-label="下一步">
                    {live ? (
                      <DeskLink href={row.href} className={buttonClass({ variant: "secondary", size: "sm" })}>
                        {row.d90 || row.d60 ? "催收" : "對帳"}
                      </DeskLink>
                    ) : (
                      <button type="button" onClick={() => onCollect(row)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                        {row.d90 || row.d60 ? "催收並入帳" : "對帳"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="glass-chip p-4">
          <h2 className="font-medium">本月損益</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {books.pnl.map((row) => (
              <li key={row.label} className="flex justify-between">
                <span className="text-cream-dim">{row.label}</span>
                <span className={row.amount < 0 ? "font-medium text-danger" : "font-medium"}>{formatTwd(row.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-chip p-4">
          <h2 className="font-medium">自動入帳</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {books.journals.map((row) => (
              <li key={row.no}>
                <p>
                  {row.date} <DeskLink href={row.href} className="hover:underline">{row.no}</DeskLink>
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
        <h2 className="text-lg font-medium">電子發票</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {live && !invoices.length ? (
            <li>
              <EmptyState compact title="還沒有電子發票" detail="收款前開立發票時，系統會配號並交給加值中心上傳。" action={{ href: "/workspace/erp/sales", label: "到生意開發票" }} help="module-finance" />
            </li>
          ) : null}
          {invoices.map((row) => (
            <li key={row.related} className="glass-chip flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                {row.no} · {row.party ?? "這張單的客人"} · 對應 {row.related}
                <label className="mt-1 flex items-center gap-2 text-xs text-cream-dim">
                  <input
                    type="checkbox"
                    checked={reconciled.includes(row.no)}
                    onChange={() => setReconciled((current) => (current.includes(row.no) ? current.filter((item) => item !== row.no) : [...current, row.no]))}
                  />
                  這張單已對過
                </label>
                {row.error ? <span className="block text-xs text-danger">{row.error}</span> : null}
              </span>
              <span className="flex items-center gap-3">
                {row.status} · {formatTwd(row.amount)}
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
      </section>
    </div>
  );
}
