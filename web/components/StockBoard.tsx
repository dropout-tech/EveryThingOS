"use client";

import { useRouter } from "next/navigation";
import { ActionNote } from "./ActionNote";
import { CourseBomBoard } from "./CourseBomBoard";
import { DeskLink } from "./DeskLink";
import { NextThing } from "./NextThing";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import type { CourseBom } from "@/lib/course-bom";
import { demoKey, peekDemoState, useDemoState, writeDemoState } from "@/lib/demo-state";
import { formatTwd, makePurchaseRequest, type PurchaseDoc, type SalesDoc, type StockRow } from "@/lib/erp";
import { nextStock } from "@/lib/next-thing";

type StockBoardProps = {
  packId: string;
  inventoryValue: number;
  batchOn: boolean;
  stock: StockRow[];
  courseBoms?: CourseBom[];
  purchases: PurchaseDoc[];
  live?: boolean;
  deskUrl?: string;
  fromBookings?: string[];
  bookingLocks?: { branchName: string; sku: string; locked: number; demand: number }[];
  caption?: string;
  /** Deposit for this job has to land before anyone buys the shortage. */
  holdBuy?: boolean;
  stopSell?: boolean;
  waste?: boolean;
  sales?: SalesDoc[];
};

export function StockBoard({ packId, inventoryValue, batchOn, stock, courseBoms = [], purchases, live = false, deskUrl, fromBookings = [], bookingLocks = [], caption = "單品", holdBuy = false, stopSell = false, waste = false, sales = [] }: StockBoardProps) {
  const router = useRouter();
  const [note, setNote] = useDemoState<string | null>(demoKey("shortage", packId), null);
  const [delta, setDelta] = useDemoState<Record<string, number>>(demoKey("stock-delta", packId), {});
  const [safetyOverride, setSafety] = useDemoState<Record<string, number>>(demoKey("safety", packId), {});
  const [stopped, setStopped] = useDemoState<Record<string, boolean>>(demoKey("stopped", packId), {});
  const [depositIn] = useDemoState(demoKey("deposit-in", packId), false);
  const waitingDeposit = holdBuy && !depositIn;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const shown = stock
    .map((row) => ({
      ...row,
      onHand: row.onHand + (delta[row.sku] ?? 0),
      safety: safetyOverride[row.sku] ?? row.safety,
      stopped: Boolean(stopped[row.sku]),
      soldTo: sales.find((doc) => doc.serial && doc.serial === row.serial)?.party,
    }))
    .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
  const focus = nextStock(shown.filter((row) => !row.stopped && !(row.expiry && row.expiry < today)));
  const lows = shown.filter((row) => !row.stopped && row.onHand < row.safety);

  async function requestBuy(row: StockRow) {
    const qty = Math.max(1, row.safety - row.onHand);
    if (live) {
      const res = await fetch("/api/erp/purchase-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: row.sku, qty, warehouse: row.warehouse, reason: "低於安全量" }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      setNote(body?.message ?? "請購沒送出去");
      return;
    }
    const existing = peekDemoState<PurchaseDoc[]>(demoKey("purchases", packId), purchases);
    if (row.expiry && row.expiry < today) {
      setNote(`${row.name} 已過期（${row.expiry}），不要賣，也不要跟新貨加在一起。`);
      return;
    }
    const po = makePurchaseRequest({
      sku: row.sku,
      name: row.name,
      amount: qty * (row.unitCost ?? 120),
    });
    writeDemoState(demoKey("purchases", packId), [po, ...existing.filter((item) => item.no !== po.no)]);
    setNote(`已為「${row.name}」開請購 ${po.no}。直接去採購頁轉進貨。`);
    window.setTimeout(() => router.push("/workspace/erp/purchase"), 600);
  }

  async function requestBomShortage(items: { sku: string; name: string; shortage: number }[], courseName: string) {
    if (live) {
      const notes: string[] = [];
      for (const item of items) {
        const res = await fetch("/api/erp/purchase-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sku: item.sku, qty: item.shortage, reason: courseName }),
        });
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        if (body?.message) notes.push(body.message);
      }
      setNote(notes.join(" ") || `「${courseName}」的請購沒送出去`);
      return;
    }
    const existing = peekDemoState<PurchaseDoc[]>(demoKey("purchases", packId), purchases);
    const created = items.map((item) =>
      makePurchaseRequest({
        sku: item.sku,
        name: `${item.name}（${courseName}缺 ${item.shortage}）`,
        amount: Math.max(1, item.shortage * (stock.find((row) => row.sku === item.sku)?.unitCost ?? 120)),
      }),
    );
    writeDemoState(demoKey("purchases", packId), [...created, ...existing]);
    setNote(`已為「${courseName}」開立 ${created.length} 筆缺料請購（${created.map((c) => c.no).join("、")}）。直接去採購頁轉進貨。`);
    window.setTimeout(() => router.push("/workspace/erp/purchase"), 600);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cream-dim">
        {waitingDeposit
          ? "低於安全量先列出來。這張單的訂金進帳，才按請購。"
          : stopSell
            ? "不夠的那一道先停賣。停了就不再出現在可賣的清單。"
            : "低於安全庫存會標「不夠」。點「請購」就開一張請購單，金額用這一項的進價，不必再填一張空白單。"}
        貨值 {formatTwd(inventoryValue)}。
      </p>
      {fromBookings.length ? (
        <ul className="glass-well space-y-1 p-4 text-sm">
          {fromBookings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <ActionNote>{note}</ActionNote>
      {focus ? (
        <NextThing
          title={`${focus.name} 不夠`}
          detail={
            waitingDeposit
              ? `現有 ${focus.onHand}，還差 ${Math.max(1, focus.safety - focus.onHand)}。這張單的訂金進帳才向廠商叫，現在只把缺的列出來。${lows.length > 1 ? `不夠的還有 ${lows.map((row) => row.name).join("、")}。` : ""}`
              : stopSell
                ? `現有 ${focus.onHand}，安全量 ${focus.safety}。先停賣，不先請購。${lows.length > 1 ? `不夠的還有 ${lows.map((row) => row.name).join("、")}。` : ""}`
                : `現有 ${focus.onHand}，安全量 ${focus.safety}。請購之後去進貨。${lows.length > 1 ? `不夠的還有 ${lows.map((row) => row.name).join("、")}。` : ""}`
          }
          action={
            <button
              type="button"
              onClick={() => {
                if (waitingDeposit) {
                  setNote(`已列缺：${focus.name} 還差 ${Math.max(1, focus.safety - focus.onHand)}。訂金進了才請購。`);
                  return;
                }
                if (stopSell) {
                  setStopped((current) => ({ ...current, [focus.sku]: true }));
                  setNote(`${focus.name} 已停賣。`);
                  return;
                }
                void requestBuy(focus);
              }}
              className={buttonClass({ variant: "primary" })}
            >
              {waitingDeposit ? "先列缺料" : stopSell ? "這道先停賣" : "請購"}
            </button>
          }
        />
      ) : null}
      {courseBoms.length ? (
        <CourseBomBoard
          initialBoms={courseBoms}
          stock={stock}
          live={live}
          deskUrl={deskUrl}
          onRequestShortage={requestBomShortage}
          onPracticeNote={setNote}
          bookingLocks={bookingLocks}
        />
      ) : null}
      <section className="glass p-5">
        <h2 className="text-sm font-medium">
          {caption}（{shown.length} 項 · 低於安全量 {lows.length} 項）
        </h2>
        <div className="mt-4 sm:overflow-x-auto">
          <table className="table-stack sm:min-w-[40rem]">
            <caption className="sr-only">庫存</caption>
            <thead className="bg-ink-2">
              <tr>
                <th scope="col">名稱</th>
                <th scope="col">品號</th>
                <th scope="col">倉</th>
                <th scope="col">現有</th>
                <th scope="col">安全</th>
                {batchOn ? <th scope="col">批號</th> : null}
                {shown.some((row) => row.expiry) ? <th scope="col">效期</th> : null}
                {shown.some((row) => row.serial) ? <th scope="col">序號</th> : null}
                <th scope="col">下一步</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const expired = Boolean(row.expiry && row.expiry < today);
                const low = !row.stopped && !expired && row.onHand < row.safety;
                return (
                  <tr key={`${row.sku}-${row.warehouse}`}>
                    <td data-primary="">
                      {row.name}
                      {row.recipe ? <span className="mt-1 block text-xs text-cream-dim">配方 {row.recipe}</span> : null}
                      {row.stopped ? <span className="mt-1 block text-xs text-warn">已停賣</span> : null}
                    </td>
                    <td data-label="品號">{row.sku}</td>
                    <td data-label="倉">{row.warehouse}</td>
                    <td data-label="現有">
                      <span className={`inline-flex items-center gap-2 ${low ? "font-medium text-warn" : ""}`}>
                        {row.onHand}
                        {low ? <Badge tone="warn">不夠</Badge> : null}
                      </span>
                    </td>
                    <td data-label="安全">
                      <input
                        key={`${row.sku}-${row.safety}`}
                        type="number"
                        min={0}
                        defaultValue={row.safety}
                        className="field w-16"
                        aria-label={`${row.name}的安全量`}
                        onBlur={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next) || next < 0) return;
                          setSafety((current) => ({ ...current, [row.sku]: next }));
                        }}
                      />
                    </td>
                    {batchOn ? <td data-label="批號">{row.batch ?? "—"}</td> : null}
                    {shown.some((item) => item.expiry) ? (
                      <td data-label="效期">{row.expiry ? `${row.expiry}${expired ? " · 過期，不要賣" : ""}` : "—"}</td>
                    ) : null}
                    {shown.some((item) => item.serial) ? (
                      <td data-label="序號">{row.serial ? `${row.serial}${row.soldTo ? ` · 賣給${row.soldTo}` : ""}` : "—"}</td>
                    ) : null}
                    <td data-label="下一步">
                      {expired ? (
                        <span className="text-warn">過期，不要賣</span>
                      ) : deskUrl && !low ? (
                        <DeskLink href={row.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                          打開
                        </DeskLink>
                      ) : low ? (
                        <button
                          type="button"
                          onClick={() =>
                            waitingDeposit
                              ? setNote(`已列缺：${row.name} 還差 ${Math.max(1, row.safety - row.onHand)}。訂金進了才請購。`)
                              : stopSell
                                ? (() => {
                                    setStopped((current) => ({ ...current, [row.sku]: true }));
                                    setNote(`${row.name} 已停賣。`);
                                  })()
                                : requestBuy(row)
                          }
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          {waitingDeposit ? "先列缺料" : stopSell ? "停賣" : "請購"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-cream-dim">
                          盤點
                          {waste ? (
                            <button
                              type="button"
                              className={buttonClass({ variant: "ghost", size: "sm" })}
                              onClick={() => {
                                setDelta((current) => ({ ...current, [row.sku]: (current[row.sku] ?? 0) - 1 }));
                                setNote(`${row.name} 報廢 1。留下數量。`);
                              }}
                            >
                              報廢
                            </button>
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
