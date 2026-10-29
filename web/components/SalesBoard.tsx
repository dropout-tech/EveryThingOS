"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ActionNote } from "./ActionNote";
import { DocSearch } from "./DocSearch";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, AdvanceButton, useLiveAction } from "./LiveAction";
import { LiveQuoteForm } from "./LiveQuoteForm";
import { NextThing } from "./NextThing";
import { buttonClass } from "./ui/Button";
import { Field } from "./ui/Field";
import { demoKey, peekDemoState, useBoardState, writeDemoState } from "@/lib/demo-state";
import {
  advanceSalesDoc,
  formatTwd,
  groupSales,
  makeQuote,
  remainingQty,
  type SalesDoc,
} from "@/lib/erp";
import { nextSalesDoc, salesPlain } from "@/lib/next-thing";
import type { Catalog } from "@/lib/sources/types";
import { tradeOf, type Trade } from "@/lib/trade";
import type { IndustryPack } from "@/lib/types";

type SalesBoardProps = {
  pack: Pick<IndustryPack, "id" | "nameZh" | "group" | "itemType" | "fulfillment" | "pains" | "modules" | "workflow">;
  initial: SalesDoc[];
  deskUrl?: string;
  catalog?: Catalog | null;
};

export function SalesBoard({ pack, initial, deskUrl, catalog }: SalesBoardProps) {
  const live = Boolean(deskUrl);
  const action = useLiveAction();
  const [docs, setDocs] = useBoardState(demoKey("sales", pack.id), initial, live);
  const trade: Trade = tradeOf(pack);
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [taxable, setTaxable] = useState(false);
  const [invoiceable, setInvoiceable] = useState(true);
  const [channel, setChannel] = useState(trade.dineIn ? "內用" : "");
  const [deposit, setDeposit] = useState("");
  const [serial, setSerial] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [returnDays, setReturnDays] = useBoardState(demoKey("return-days", pack.id), trade.returnDays, live);
  const [note, setNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
  const focus = nextSalesDoc(docs);

  function onAdvance(doc: SalesDoc) {
    if (doc.next === "完成") return;
    const next = advanceSalesDoc(doc, pack);
    setDocs((current) => current.map((item) => (item.no === doc.no ? next : item)));
    if (doc.deposit && next.step === "paid") {
      writeDemoState(demoKey("deposit-in", pack.id), true);
    }
    if (doc.channel === "外帶" && next.step === "fulfill") {
      const delta = peekDemoState<Record<string, number>>(demoKey("stock-delta", pack.id), {});
      writeDemoState(demoKey("stock-delta", pack.id), { ...delta, "PKG-BOX": (delta["PKG-BOX"] ?? 0) - doc.qty });
    }
    setNote(`${doc.party}：${doc.next}。同一張單往前走。${doc.channel === "外帶" && next.step === "fulfill" ? "外帶容器另扣。" : ""}`);
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(amount.replace(/[,，\s]/g, ""));
    const depositAmount = Math.round(Number(deposit.replace(/[,，\s]/g, "")));
    const quote = makeQuote({
      party,
      item: pack.itemType,
      amount: parsed,
      pack,
      taxable,
      invoiceable,
      deposit: trade.deposit && depositAmount > 0 ? depositAmount : undefined,
      channel: channel || undefined,
      serial: serial || undefined,
      buyerTaxId: buyerTaxId || undefined,
    });
    if (!quote) {
      setFormError(party.trim() ? "金額要是 1 到一千萬之間的數字。" : "請填客戶名稱。");
      return;
    }
    setFormError(null);
    setDocs((current) => [quote, ...current]);
    setParty("");
    setAmount("");
    if (quote.kind === "deposit") writeDemoState(demoKey("deposit-in", pack.id), false);
    setNote(`已開 ${quote.no}。${quote.taxable ? "含 5% 營業稅。" : "未稅報價。"}${quote.invoiceable ? "" : "這行不開發票。"}`);
  }

  return (
    <div className="space-y-4">
      {live ? (
        <div className="glass space-y-2 p-4">
          {catalog ? <LiveQuoteForm catalog={catalog} action={action} emphasis={focus ? "secondary" : "primary"} /> : null}
          <p className="text-xs text-cream-dim">
            報價、轉訂單、出貨、開發票、收款都直接寫進 ERPNext，照你的角色權限。要改細節時{" "}
            <DeskLink href={`${deskUrl}/app/quotation/new`} className="underline underline-offset-2">
              在 ERPNext 開單
            </DeskLink>
            。
          </p>
        </div>
      ) : (
      <form onSubmit={onCreate} noValidate className="glass grid gap-3 p-4 sm:flex sm:flex-wrap sm:items-end">
        <Field label="誰在問" className="sm:w-48" error={formError && !party.trim() ? formError : null}>
          <input value={party} onChange={(event) => setParty(event.target.value)} maxLength={40} placeholder="客戶名稱" autoComplete="off" className="field" />
        </Field>
        <Field label="未稅金額" className="sm:w-36" error={formError && party.trim() ? formError : null}>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" placeholder="28600" className="field" />
        </Field>
        {trade.dineIn ? (
          <Field label="內用或外帶" className="sm:w-36">
            <select value={channel} onChange={(event) => setChannel(event.target.value)} className="field">
              <option>內用</option>
              <option>外帶</option>
            </select>
          </Field>
        ) : null}
        {trade.deposit ? (
          <Field label="訂金（可空白）" className="sm:w-36">
            <input value={deposit} onChange={(event) => setDeposit(event.target.value)} inputMode="numeric" placeholder="訂金" className="field" />
          </Field>
        ) : null}
        {trade.serial ? (
          <Field label="序號" className="sm:w-36">
            <input value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="SN-" className="field" />
          </Field>
        ) : null}
        <Field label="統編（可空白）" className="sm:w-36">
          <input value={buyerTaxId} onChange={(event) => setBuyerTaxId(event.target.value)} placeholder="統編" className="field" />
        </Field>
        <button type="submit" className={buttonClass({ variant: focus ? "secondary" : "primary" })}>
          開一張報價
        </button>
        <label className="flex items-center gap-2 text-xs text-cream-dim">
          <input type="checkbox" checked={taxable} onChange={(event) => setTaxable(event.target.checked)} />
          這張加 5% 營業稅
        </label>
        <label className="flex items-center gap-2 text-xs text-cream-dim">
          <input type="checkbox" checked={invoiceable} onChange={(event) => setInvoiceable(event.target.checked)} />
          這行可以開發票
        </label>
        {trade.returns ? (
          <label className="flex items-center gap-2 text-xs text-cream-dim">
            退換天數
            <input
              type="number"
              min={0}
              max={60}
              value={returnDays}
              onChange={(event) => setReturnDays(Number(event.target.value))}
              className="field w-16"
            />
          </label>
        ) : null}
        <p className="text-xs text-cream-dim sm:basis-full">
          這一包是「{pack.itemType}」。做到「{pack.fulfillment}」。{trade.returns ? `退換 ${returnDays} 天，憑這張單。` : ""}
          {trade.dineIn ? "外帶會另扣外帶容器。" : ""}
        </p>
      </form>
      )}
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      {focus ? (
        <NextThing
          title={focus.overdueDays ? `${focus.party} 逾期 ${focus.overdueDays} 天` : `${focus.party}：${salesPlain(focus.step)}`}
          detail={`下一步只做「${focus.next}」。其餘的單在下面，每張還是只有這一個按鈕。`}
          action={
            live ? (
              <AdvanceButton doctype={focus.doctype} name={focus.no} label={focus.next} run={action.run} busy={action.busy} className={buttonClass({ variant: "primary" })} />
            ) : (
              <button type="button" onClick={() => onAdvance(focus)} className={buttonClass({ variant: "primary" })}>
                {focus.next}
              </button>
            )
          }
        />
      ) : null}
      <DocSearch rows={docs}>
        {(found) => (
      <div className="grid gap-3 lg:grid-cols-5">
        {groupSales(found).map((column) => (
          <section key={column.id} className="glass-well p-3" aria-label={`${column.plain}（${column.docs.length}）`}>
            <h2 className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <span>
              {trade.stepPlain[column.id]}
              <span className="ml-1 text-xs font-normal text-cream-dim">{column.formal}</span>
              </span>
              <span className="text-xs text-cream-dim">{column.docs.length}</span>
            </h2>
            <ul className="mt-3 space-y-2">
              {column.docs.length ? (
                column.docs.map((doc) => (
                  <li key={doc.no} className="glass-chip p-3">
                    <p className="text-xs text-cream-dim">{doc.no}</p>
                    <p className="mt-1">{doc.party}</p>
                    <p className="text-sm text-cream-dim">
                      {doc.item} × {doc.qty}
                    </p>
                    {typeof doc.orderedQty === "number" && typeof doc.deliveredQty === "number" && doc.orderedQty > doc.deliveredQty ? (
                      <p className="mt-1 text-xs text-cream-dim">還差 {remainingQty(doc)}</p>
                    ) : null}
                    <p className="mt-1 font-medium">{formatTwd(doc.amount + doc.tax)}{doc.taxable === false ? " · 未稅" : ""}</p>
                    {doc.deposit ? <p className="mt-1 text-xs text-cream-dim">訂金 {formatTwd(doc.deposit)}，尾款另計</p> : null}
                    {doc.kind === "change" ? <p className="mt-1 text-xs text-cream-dim">追加，原單 {doc.parentNo}</p> : null}
                    {doc.kind === "monthly" ? <p className="mt-1 text-xs text-cream-dim">併進本月月結</p> : null}
                    {doc.channel ? <p className="mt-1 text-xs text-cream-dim">{doc.channel}</p> : null}
                    {doc.serial ? <p className="mt-1 text-xs text-cream-dim">序號 {doc.serial} · {doc.party}</p> : null}
                    {doc.buyerTaxId ? <p className="mt-1 text-xs text-cream-dim">統編 {doc.buyerTaxId}</p> : null}
                    {doc.allowance ? <p className="mt-1 text-xs text-cream-dim">已折讓</p> : null}
                    {doc.invoiceNo ? (
                      <p className="mt-1 text-xs text-cream-dim">發票 {doc.invoiceNo} · {doc.party}</p>
                    ) : null}
                    {doc.overdueDays ? (
                      <p className="mt-1 text-xs text-warn">已逾期 {doc.overdueDays} 天</p>
                    ) : null}
                    {live ? (
                      <>
                        {doc.next !== "完成" ? <AdvanceButton doctype={doc.doctype} name={doc.no} label={doc.next} run={action.run} busy={action.busy} /> : null}
                        <DeskLink href={doc.href} className={buttonClass({ variant: "ghost", size: "sm", block: true, className: "mt-1" })}>
                          打開
                        </DeskLink>
                      </>
                    ) : (
                      <>
                      <button
                        type="button"
                        disabled={doc.next === "完成"}
                        onClick={() => onAdvance(doc)}
                        className={buttonClass({ variant: "secondary", size: "sm", block: true, className: "mt-2" })}
                      >
                        {doc.next}
                      </button>
                      {trade.changeOrder ? (
                        <button type="button" className={buttonClass({ variant: "ghost", size: "sm", block: true })} onClick={() => {
                          const extra = makeQuote({ party: doc.party, item: `${doc.item}追加`, amount: doc.amount, pack, taxable: doc.taxable, kind: "change", parentNo: doc.no });
                          if (extra) setDocs((current) => [extra, ...current]);
                        }}>另開追加</button>
                      ) : null}
                      {trade.monthlyBill && doc.step === "invoice" ? (
                        <button type="button" className={buttonClass({ variant: "ghost", size: "sm", block: true })} onClick={() => setDocs((current) => current.map((item) => item.no === doc.no ? { ...item, kind: "monthly" } : item))}>併入月結</button>
                      ) : null}
                      {doc.invoiceNo ? (
                        <button type="button" className={buttonClass({ variant: "ghost", size: "sm", block: true })} onClick={() => setDocs((current) => current.map((item) => item.no === doc.no ? { ...item, allowance: true } : item))}>折讓</button>
                      ) : null}
                      {trade.returns ? (
                        <button type="button" className={buttonClass({ variant: "ghost", size: "sm", block: true })} onClick={() => setDocs((current) => current.map((item) => item.no === doc.no ? { ...item, kind: "return" } : item))}>退換（{returnDays} 天內）</button>
                      ) : null}
                      </>
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
        )}
      </DocSearch>
    </div>
  );
}
