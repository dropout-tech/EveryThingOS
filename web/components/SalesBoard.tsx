"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, AdvanceButton, useLiveAction } from "./LiveAction";
import { LiveQuoteForm } from "./LiveQuoteForm";
import { demoKey, peekDemoState, useBoardState, writeDemoState } from "@/lib/demo-state";
import {
  advanceSalesDoc,
  formatTwd,
  groupSales,
  makeQuote,
  type SalesDoc,
} from "@/lib/erp";
import type { Catalog } from "@/lib/sources/types";
import type { IndustryPack } from "@/lib/types";

type SalesBoardProps = {
  pack: Pick<IndustryPack, "id" | "itemType" | "fulfillment" | "modules">;
  initial: SalesDoc[];
  deskUrl?: string;
  catalog?: Catalog | null;
};

export function SalesBoard({ pack, initial, deskUrl, catalog }: SalesBoardProps) {
  const live = Boolean(deskUrl);
  const action = useLiveAction();
  const [docs, setDocs] = useBoardState(demoKey("sales", pack.id), initial, live);
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (live) return;
    const inbox = peekDemoState<SalesDoc[]>(demoKey("inbox", pack.id), []);
    if (!inbox.length) return;
    const stored = peekDemoState<SalesDoc[]>(demoKey("sales", pack.id), initial);
    const existing = new Set(stored.map((item) => item.no));
    const incoming = inbox.filter((item) => !existing.has(item.no));
    if (!incoming.length) {
      writeDemoState(demoKey("inbox", pack.id), [] as SalesDoc[]);
      return;
    }
    setDocs([...incoming, ...stored]);
    writeDemoState(demoKey("inbox", pack.id), [] as SalesDoc[]);
  }, [live, pack.id, initial, setDocs]);
  const columns = useMemo(() => groupSales(docs), [docs]);

  function onAdvance(doc: SalesDoc) {
    if (doc.next === "完成") return;
    const next = advanceSalesDoc(doc, pack);
    setDocs((current) => current.map((item) => (item.no === doc.no ? next : item)));
    setNote(`${doc.party}：${doc.next}。同一張單往前走，不必切到另一個畫面再開單。`);
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(amount.replace(/[,，\s]/g, ""));
    const quote = makeQuote({
      party,
      item: pack.itemType,
      amount: parsed,
      pack,
    });
    if (!quote) {
      setNote("請填客戶名稱，金額須為 1 到 一千萬的數字。");
      return;
    }
    setDocs((current) => [quote, ...current]);
    setParty("");
    setAmount("");
    setNote(`已開 ${quote.no}。客人在問 → 下一步只會看到「轉成訂單」。`);
  }

  return (
    <div className="space-y-4">
      {live ? (
        <div className="glass space-y-2 p-4">
          {catalog ? <LiveQuoteForm catalog={catalog} action={action} /> : null}
          <p className="text-xs text-cream-dim">
            報價、轉訂單、出貨、開發票、收款都直接寫進 ERPNext，照你的角色權限。要改細節時{" "}
            <DeskLink href={`${deskUrl}/app/quotation/new`} className="text-teal underline">
              在 ERPNext 開單
            </DeskLink>
            。
          </p>
        </div>
      ) : (
      <form
        onSubmit={onCreate}
        className="glass flex flex-wrap items-end gap-2 p-4"
      >
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">誰在問</span>
          <input
            value={party}
            onChange={(event) => setParty(event.target.value)}
            maxLength={40}
            placeholder="客戶名稱"
            className="mt-1 w-44 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">未稅金額</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            placeholder="28600"
            className="mt-1 w-32 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream"
          />
        </label>
        <button type="submit" className="glass-cta rounded-full px-4 py-2 text-sm">
          開一張報價
        </button>
        <p className="text-xs text-cream-dim">稅 5% 自動加。這一包賣的是「{pack.itemType}」。</p>
      </form>
      )}
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      <div className="grid gap-3 lg:grid-cols-5">
        {columns.map((column) => (
          <section key={column.id} className="glass-well p-3">
            <h3 className="text-sm">
              {column.plain}
              <span className="ml-1 text-xs text-cream-dim">{column.formal}</span>
            </h3>
            <ul className="mt-3 space-y-2">
              {column.docs.length ? (
                column.docs.map((doc) => (
                  <li key={doc.no} className="glass-chip p-3">
                    <p className="text-xs text-cream-dim">{doc.no}</p>
                    <p className="mt-1">{doc.party}</p>
                    <p className="text-sm text-cream-dim">
                      {doc.item} × {doc.qty}
                    </p>
                    <p className="mt-1 text-teal">{formatTwd(doc.amount + doc.tax)}</p>
                    {doc.invoiceNo ? (
                      <p className="mt-1 text-xs text-cream-dim">發票 {doc.invoiceNo}</p>
                    ) : null}
                    {doc.overdueDays ? (
                      <p className="mt-1 text-xs text-orange">已逾期 {doc.overdueDays} 天</p>
                    ) : null}
                    {live ? (
                      <>
                        {doc.next !== "完成" ? <AdvanceButton doctype={doc.doctype} name={doc.no} label={doc.next} run={action.run} busy={action.busy} /> : null}
                        <DeskLink href={doc.href} className="mt-1 block text-center text-xs text-cream-dim hover:text-cream">
                          打開
                        </DeskLink>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={doc.next === "完成"}
                        onClick={() => onAdvance(doc)}
                        className="glass-pill mt-2 w-full py-1.5 text-xs disabled:opacity-40"
                      >
                        {doc.next}
                      </button>
                    )}
                  </li>
                ))
              ) : (
                <li className="text-xs text-cream-dim">這一格目前沒單</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
