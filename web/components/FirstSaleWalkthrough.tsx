"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { demoKey, useDemoState } from "@/lib/demo-state";
import { SALES_STEPS, advanceSalesDoc, formatTwd, makeQuote, type SalesDoc } from "@/lib/erp";
import type { IndustryPack } from "@/lib/types";

type Pack = Pick<IndustryPack, "id" | "itemType" | "fulfillment" | "modules">;

const TAG = "練習・";

/** What each step means on the floor, and what the same button does once ERPNext is connected. */
const STEPS = [
  { title: "報價", plain: "客人在問", what: "填客人和金額，開一張報價。稅 5% 自動加。", real: "接上 ERPNext 後，「生意」的開報價會建一張報價單（Quotation）並送出。" },
  { title: "客人答應", plain: "答應要了", what: "客人說好，同一張單按「轉成訂單」。不用重打一次。", real: "ERPNext 從報價轉出訂單（Sales Order），交期沒填就先抓 7 天後。" },
  { title: "出貨／履行", plain: "做完／貨走了", what: "東西交給客人了，按下一步。", real: "ERPNext 開出貨單（Delivery Note）；有庫存的商品，庫存會跟著扣。" },
  { title: "請他付錢", plain: "請他付錢", what: "開發票給客人。這張單會出現在「誰欠我們」。", real: "ERPNext 開銷項發票（Sales Invoice），記上應收帳款；有接電子發票的公司，發票號碼會回寫到這張單。" },
  { title: "收款", plain: "錢進來了", what: "錢收到了，按「記入已收」，這筆生意就走完了。", real: "ERPNext 記一筆收款（Payment Entry）沖掉這張發票，帳齡跟著少一筆。" },
] as const;

const ORDER = SALES_STEPS.map((s) => s.id);

export function FirstSaleWalkthrough({ pack, seed, person, live }: { pack: Pack; seed: SalesDoc[]; person: string; live: boolean }) {
  const [docs, setDocs] = useDemoState(demoKey("sales", pack.id), seed);
  const [run, setRun] = useDemoState<{ no: string | null }>(demoKey("practice-run", pack.id), { no: null });
  const [party, setParty] = useState(person);
  const [amount, setAmount] = useState("12000");
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const doc = run.no ? docs.find((d) => d.no === run.no) ?? null : null;
  const finished = doc?.step === "paid";
  const current = doc ? ORDER.indexOf(doc.step) + 1 : 0;

  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [current]);

  function start(event: FormEvent) {
    event.preventDefault();
    const name = party.trim();
    const quote = makeQuote({
      party: name.startsWith(TAG) ? name : `${TAG}${name}`,
      item: pack.itemType,
      amount: Number(amount.replace(/[,，\s]/g, "")),
      pack,
    });
    if (!name || !quote) {
      setError("請填客人名字，金額要是 1 到一千萬之間的數字。");
      return;
    }
    setError(null);
    moved.current = true;
    setDocs((list) => [quote, ...list]);
    setRun({ no: quote.no });
    setSaid(`已開 ${quote.no}：${quote.party}，${formatTwd(quote.amount + quote.tax)}（含稅）。`);
  }

  function step() {
    if (!doc || finished) return;
    const next = advanceSalesDoc(doc, pack);
    moved.current = true;
    setDocs((list) => list.map((d) => (d.no === doc.no ? next : d)));
    setSaid(`${doc.no}：${doc.next}。`);
  }

  function restart() {
    moved.current = true;
    if (run.no) setDocs((list) => list.filter((d) => d.no !== run.no));
    setRun({ no: null });
    setSaid("重來一次。剛剛那張練習單已經拿掉了。");
  }

  return (
    <div className="space-y-5">
      <p className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs" role="note">
        <span className="rounded-full bg-orange px-2 py-0.5 text-ink">練習</span>
        {live ? "只存在這個瀏覽器分頁，不會寫進 ERPNext。真的要開單，到「生意」。" : "用練習帳本，關掉分頁就清掉，不會動到任何真的資料。"}
      </p>

      <ol className="grid gap-2 sm:grid-cols-5" aria-label="第一筆生意的五步">
        {STEPS.map((s, index) => {
          const state = index < current ? "done" : index === current ? "now" : "later";
          return (
            <li
              key={s.title}
              aria-current={state === "now" ? "step" : undefined}
              className={`rounded-2xl px-3 py-2 text-sm ${state === "now" ? "glass-cta" : state === "done" ? "glass-chip" : "glass-well text-cream-dim"}`}
            >
              <span className="display block text-[11px]">
                0{index + 1}
                <span className="sr-only">{state === "done" ? "，已完成" : state === "now" ? "，現在這步" : ""}</span>
              </span>
              <span className="block">{s.title}</span>
            </li>
          );
        })}
      </ol>

      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      <section className="glass glass-hero space-y-4 p-6 md:p-8" aria-labelledby="practice-step">
        {current < STEPS.length ? (
          <>
            <p className="display text-[11px] tracking-[0.2em] text-cream-dim uppercase">
              第 {current + 1} 步，共 {STEPS.length} 步 · {STEPS[current].plain}
            </p>
            <h2 id="practice-step" ref={headingRef} tabIndex={-1} className="text-3xl font-medium outline-none">
              {STEPS[current].title}
            </h2>
            <p className="max-w-xl text-cream-dim">{STEPS[current].what}</p>

            {current === 0 ? (
              <form onSubmit={start} className="flex flex-wrap items-end gap-3" noValidate>
                <label className="text-sm">
                  <span className="block text-xs text-cream-dim">客人</span>
                  <input
                    value={party}
                    onChange={(e) => setParty(e.target.value)}
                    maxLength={34}
                    required
                    className="mt-1 w-48 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-cream-dim">未稅金額</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="numeric"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "practice-error" : undefined}
                    className="mt-1 w-32 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream"
                  />
                </label>
                <button type="submit" className="glass-cta rounded-full px-5 py-2.5 text-sm">
                  開報價（練習）
                </button>
                {error ? (
                  <p id="practice-error" className="w-full text-sm text-orange" role="alert">
                    {error}
                  </p>
                ) : null}
              </form>
            ) : doc ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="glass-chip min-w-56 p-4">
                  <p className="text-xs text-cream-dim">{doc.no}</p>
                  <p className="mt-1">{doc.party}</p>
                  <p className="text-sm text-cream-dim">
                    {doc.item} × {doc.qty}
                  </p>
                  <p className="mt-1 text-teal">{formatTwd(doc.amount + doc.tax)}</p>
                  {doc.invoiceNo ? <p className="mt-1 text-xs text-cream-dim">發票 {doc.invoiceNo}（練習號碼）</p> : null}
                </div>
                <button type="button" onClick={step} className="glass-cta rounded-full px-5 py-2.5 text-sm">
                  {doc.next}
                </button>
              </div>
            ) : null}

            <p className="max-w-xl border-l border-[var(--line)] pl-3 text-xs text-cream-dim">
              真的時候：{STEPS[current].real}
            </p>
          </>
        ) : doc ? (
          <>
            <p className="display text-[11px] tracking-[0.2em] text-cream-dim uppercase">走完了</p>
            <h2 id="practice-step" ref={headingRef} tabIndex={-1} className="text-3xl font-medium outline-none">
              一筆生意，從問到收錢
            </h2>
            <p className="max-w-xl text-cream-dim">
              {doc.party} 的 {formatTwd(doc.amount + doc.tax)}，同一張單走了五步：報價 → 訂單 → 出貨 → 發票 → 收款。真的生意也是這樣，每一步只有一個按鈕。
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              {live ? (
                <Link href="/workspace/erp/sales" className="glass-cta rounded-full px-5 py-2.5">
                  去開第一張真的報價
                </Link>
              ) : (
                <Link href="/workspace/erp/sales" className="glass-cta rounded-full px-5 py-2.5">
                  在「生意」看這張練習單
                </Link>
              )}
              <Link href="/workspace" className="glass-pill rounded-full px-5 py-2.5">
                回今天
              </Link>
            </div>
          </>
        ) : null}
      </section>

      <p className="flex flex-wrap gap-4 text-xs text-cream-dim">
        {doc ? (
          <button type="button" onClick={restart} className="underline hover:text-cream">
            重來一次
          </button>
        ) : null}
        <Link href="/help/practice" className="underline hover:text-cream">
          練習怎麼運作
        </Link>
        <Link href="/help/module-sales" className="underline hover:text-cream">
          「生意」說明
        </Link>
      </p>
    </div>
  );
}
