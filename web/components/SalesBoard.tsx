"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, AdvanceButton, useLiveAction } from "./LiveAction";
import { LiveQuoteForm } from "./LiveQuoteForm";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { Drawer } from "./ui/Drawer";
import { Field } from "./ui/Field";
import { Money } from "./ui/Money";
import { SearchBox } from "./ui/SearchBox";
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
  const [errors, setErrors] = useState<{ party?: string; amount?: string }>({});
  const [touched, setTouched] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openNo, setOpenNo] = useState<string | null>(null);
  const opened = docs.find((doc) => doc.no === openNo) ?? null;

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
  const needle = query.trim().toLowerCase();
  const columns = useMemo(
    () => groupSales(needle ? docs.filter((doc) => `${doc.party} ${doc.no} ${doc.invoiceNo ?? ""}`.toLowerCase().includes(needle)) : docs),
    [docs, needle],
  );

  function check(nextParty: string, nextAmount: string) {
    const parsed = Number(nextAmount.replace(/[,，\s]/g, ""));
    const found: { party?: string; amount?: string } = {};
    if (!nextParty.trim()) found.party = "請填客戶名稱。";
    if (!nextAmount.trim()) found.amount = "請填金額，例如 28600。";
    else if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10_000_000) found.amount = "金額要是 1 到一千萬之間的數字。";
    return { found, parsed };
  }

  function onAdvance(doc: SalesDoc) {
    if (doc.next === "完成") return;
    const next = advanceSalesDoc(doc, pack);
    setDocs((current) => current.map((item) => (item.no === doc.no ? next : item)));
    setNote(`${doc.party}：${doc.next}。同一張單往前走，不必切到另一個畫面再開單。`);
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    const { found, parsed } = check(party, amount);
    const quote = found.party || found.amount ? null : makeQuote({ party, item: pack.itemType, amount: parsed, pack });
    if (!quote) {
      setErrors(Object.keys(found).length ? found : { amount: "金額要是 1 到一千萬之間的數字。" });
      const field = event.currentTarget.querySelector<HTMLInputElement>(found.party ? "input[name=party]" : "input[name=amount]");
      field?.focus();
      return;
    }
    setErrors({});
    setTouched(false);
    setDocs((current) => [quote, ...current]);
    setFresh(quote.no);
    setQuery("");
    setParty("");
    setAmount("");
    setNote(`已開 ${quote.no}：${quote.party}，含稅 ${formatTwd(quote.amount + quote.tax)}。下一步是「轉成訂單」。`);
  }

  const preview = Number(amount.replace(/[,，\s]/g, "")) || 0;

  return (
    <div className="space-y-4">
      {live ? (
        <div id="new-quote" className="glass space-y-2 p-4">
          {catalog ? <LiveQuoteForm catalog={catalog} action={action} /> : null}
          <p className="text-xs text-cream-dim">
            報價、轉訂單、出貨、開發票、收款都直接寫進 ERPNext，照你的角色權限。要改細節時{" "}
            <DeskLink href={`${deskUrl}/app/quotation/new`} className="underline underline-offset-2">
              在 ERPNext 開單
            </DeskLink>
            。
          </p>
        </div>
      ) : (
      <form id="new-quote" onSubmit={onCreate} noValidate aria-label="開一張報價" className="glass grid gap-3 p-4 sm:flex sm:flex-wrap sm:items-start">
        <Field label="誰在問" className="sm:w-56" error={errors.party}>
          <input
            name="party"
            value={party}
            onChange={(event) => {
              setParty(event.target.value);
              if (touched) setErrors(check(event.target.value, amount).found);
            }}
            maxLength={40}
            placeholder="客戶名稱"
            autoComplete="off"
            enterKeyHint="next"
            required
            className="field"
          />
        </Field>
        <Field label="未稅金額（NT$）" className="sm:w-44" error={errors.amount} hint={errors.amount ? null : preview > 0 ? `含稅 ${formatTwd(Math.round(preview * 1.05))}` : "稅 5% 自動加"}>
          <input
            name="amount"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              if (touched) setErrors(check(party, event.target.value).found);
            }}
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="28600"
            autoComplete="off"
            required
            className="field num"
          />
        </Field>
        <div className="form-actions sticky-submit sm:pt-[1.35rem]">
          <button type="submit" className={buttonClass({ variant: "primary", className: "w-full sm:w-auto" })}>
            開一張報價
          </button>
        </div>
        <p className="text-xs text-cream-dim sm:basis-full">這一包賣的是「{pack.itemType}」。</p>
      </form>
      )}
      {docs.length > 3 ? (
        <div className="toolbar">
          <SearchBox label="找單" placeholder="客戶、單號或發票號碼" value={query} onChange={setQuery} />
        </div>
      ) : null}
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      <div className="grid gap-3 lg:grid-cols-5">
        {columns.map((column) => (
          <section key={column.id} className="glass-well p-3" aria-label={`${column.plain}（${column.docs.length}）`}>
            <h2 className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>
              {column.plain}
              <span className="ml-1 text-xs font-normal text-cream-dim">{column.formal}</span>
              </span>
              <span className="badge-count">{column.docs.length}</span>
            </h2>
            <ul className="mt-3 space-y-2">
              {column.docs.length ? (
                column.docs.map((doc) => (
                  <li key={doc.no} className="glass-chip p-3">
                    <p className="flex items-center justify-between gap-2 text-xs text-cream-dim">
                      {doc.no}
                      {fresh === doc.no ? <Badge tone="ok">剛開好</Badge> : null}
                    </p>
                    <button type="button" className="mt-1 flex w-full items-center gap-2 text-left" aria-haspopup="dialog" onClick={() => setOpenNo(doc.no)}>
                      <Avatar name={doc.party} />
                      <span className="min-w-0 truncate underline decoration-[color-mix(in_srgb,currentColor_30%,transparent)] underline-offset-4">{doc.party}</span>
                    </button>
                    <p className="text-sm text-cream-dim">
                      {doc.item} × {doc.qty}
                    </p>
                    <Money amount={doc.amount + doc.tax} className="mt-1 block font-medium" />
                    {doc.invoiceNo ? (
                      <p className="mt-1 text-xs text-cream-dim">發票 {doc.invoiceNo}</p>
                    ) : null}
                    {doc.overdueDays ? (
                      <Badge tone="warn" className="mt-1">
                        逾期 {doc.overdueDays} 天
                      </Badge>
                    ) : null}
                    {live ? (
                      <>
                        {doc.next !== "完成" ? <AdvanceButton doctype={doc.doctype} name={doc.no} label={doc.next} run={action.run} busy={action.busy} /> : null}
                        <DeskLink href={doc.href} className={buttonClass({ variant: "ghost", size: "sm", block: true, className: "mt-1" })}>
                          打開
                        </DeskLink>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={doc.next === "完成"}
                        onClick={() => onAdvance(doc)}
                        className={buttonClass({ variant: "secondary", size: "sm", block: true, className: "mt-2" })}
                      >
                        {doc.next}
                      </button>
                    )}
                  </li>
                ))
              ) : (
                <li className="text-xs text-cream-dim">{needle ? "沒有符合的單" : "這一格目前沒單"}</li>
              )}
            </ul>
          </section>
        ))}
      </div>
      <Drawer
        open={Boolean(opened)}
        title={opened?.party ?? ""}
        onClose={() => setOpenNo(null)}
        footer={
          opened ? (
            live ? (
              <>
                {opened.next !== "完成" ? (
                  <AdvanceButton doctype={opened.doctype} name={opened.no} label={opened.next} run={action.run} busy={action.busy} className={buttonClass({ variant: "primary" })} />
                ) : null}
                <DeskLink href={opened.href} className={buttonClass({ variant: "secondary" })}>
                  在 ERPNext 打開
                </DeskLink>
              </>
            ) : opened.next !== "完成" ? (
              <button
                type="button"
                className={buttonClass({ variant: "primary" })}
                onClick={() => {
                  onAdvance(opened);
                  setOpenNo(null);
                }}
              >
                {opened.next}
              </button>
            ) : null
          ) : null
        }
      >
        {opened ? (
          <dl>
            <dt>單號</dt>
            <dd>{opened.no}</dd>
            <dt>現在在</dt>
            <dd>{columns.find((column) => column.id === opened.step)?.plain}</dd>
            <dt>賣什麼</dt>
            <dd>
              {opened.item} × <span className="num">{opened.qty}</span>
            </dd>
            <dt>未稅</dt>
            <dd>
              <Money amount={opened.amount} />
            </dd>
            <dt>稅</dt>
            <dd>
              <Money amount={opened.tax} />
            </dd>
            <dt>含稅</dt>
            <dd className="font-medium">
              <Money amount={opened.amount + opened.tax} />
            </dd>
            {opened.invoiceNo ? (
              <>
                <dt>發票</dt>
                <dd>{opened.invoiceNo}</dd>
              </>
            ) : null}
            {opened.overdueDays ? (
              <>
                <dt>逾期</dt>
                <dd className="text-warn">{opened.overdueDays} 天</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Drawer>
    </div>
  );
}
