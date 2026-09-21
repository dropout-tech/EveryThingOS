"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionNote } from "./ActionNote";
import { demoKey, peekDemoState, useDemoState, writeDemoState } from "@/lib/demo-state";
import {
  advanceSalesDoc,
  formatTwd,
  groupSales,
  makeQuote,
  type SalesDoc,
} from "@/lib/erp";
import type { IndustryPack } from "@/lib/types";

type SalesBoardProps = {
  pack: Pick<IndustryPack, "id" | "itemType" | "fulfillment" | "modules">;
  initial: SalesDoc[];
};

export function SalesBoard({ pack, initial }: SalesBoardProps) {
  const [docs, setDocs] = useDemoState(demoKey("sales", pack.id), initial);
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
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
  }, [pack.id, initial, setDocs]);
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
      <ActionNote>{note}</ActionNote>
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
                    <button
                      type="button"
                      disabled={doc.next === "完成"}
                      onClick={() => onAdvance(doc)}
                      className="glass-pill mt-2 w-full py-1.5 text-xs disabled:opacity-40"
                    >
                      {doc.next}
                    </button>
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
