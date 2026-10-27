"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { CourseBomBoard } from "./CourseBomBoard";
import { DeskLink } from "./DeskLink";
import { NextThing } from "./NextThing";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import type { CourseBom } from "@/lib/course-bom";
import { demoKey, peekDemoState, writeDemoState } from "@/lib/demo-state";
import { formatTwd, makePurchaseRequest, type PurchaseDoc, type StockRow } from "@/lib/erp";
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
};

export function StockBoard({ packId, inventoryValue, batchOn, stock, courseBoms = [], purchases, live = false, deskUrl, fromBookings = [], bookingLocks = [], caption = "單品", holdBuy = false }: StockBoardProps) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const focus = nextStock(stock);
  const others = stock.filter((row) => row.onHand < row.safety).length - (focus ? 1 : 0);

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
    const po = makePurchaseRequest({
      sku: row.sku,
      name: row.name,
      amount: qty * 800,
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
        amount: Math.max(1, item.shortage * 600),
      }),
    );
    writeDemoState(demoKey("purchases", packId), [...created, ...existing]);
    setNote(`已為「${courseName}」開立 ${created.length} 筆缺料請購（${created.map((c) => c.no).join("、")}）。直接去採購頁轉進貨。`);
    window.setTimeout(() => router.push("/workspace/erp/purchase"), 600);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cream-dim">
        {holdBuy
          ? "低於安全量先列出來。這張單的訂金進帳，才按請購。"
          : "低於安全庫存會標「不夠」。點「請購」就開一張請購單，不必再填一張空白單。"}
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
            holdBuy
              ? `現有 ${focus.onHand}，還差 ${Math.max(1, focus.safety - focus.onHand)}。這張單的訂金進帳才向廠商叫，現在只把缺的列出來。`
              : `現有 ${focus.onHand}，安全量 ${focus.safety}。請購之後去進貨。${others > 0 ? `下面還有 ${others} 項不夠。` : ""}`
          }
          action={
            <button
              type="button"
              onClick={() =>
                holdBuy
                  ? setNote(`已列缺：${focus.name} 還差 ${Math.max(1, focus.safety - focus.onHand)}。訂金進了才請購。`)
                  : requestBuy(focus)
              }
              className={buttonClass({ variant: "primary" })}
            >
              {holdBuy ? "先列缺料" : "請購"}
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
      <details className="glass p-5">
        <summary className="cursor-pointer select-none text-sm font-medium">
          {caption}（{stock.length} 項 · 低於安全量 {stock.filter((r) => r.onHand < r.safety).length} 項）
        </summary>
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
                <th scope="col">下一步</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => {
                const low = row.onHand < row.safety;
                return (
                  <tr key={`${row.sku}-${row.warehouse}`}>
                    <td data-primary="">{row.name}</td>
                    <td data-label="品號">{row.sku}</td>
                    <td data-label="倉">{row.warehouse}</td>
                    <td data-label="現有">
                      <span className={`inline-flex items-center gap-2 ${low ? "font-medium text-warn" : ""}`}>
                        {row.onHand}
                        {low ? <Badge tone="warn">不夠</Badge> : null}
                      </span>
                    </td>
                    <td data-label="安全">{row.safety}</td>
                    {batchOn ? <td data-label="批號">{row.batch ?? "—"}</td> : null}
                    <td data-label="下一步">
                      {deskUrl && !low ? (
                        <DeskLink href={row.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                          打開
                        </DeskLink>
                      ) : low ? (
                        <button
                          type="button"
                          onClick={() =>
                            holdBuy
                              ? setNote(`已列缺：${row.name} 還差 ${Math.max(1, row.safety - row.onHand)}。訂金進了才請購。`)
                              : requestBuy(row)
                          }
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          {holdBuy ? "先列缺料" : "請購"}
                        </button>
                      ) : (
                        <span className="text-cream-dim">盤點</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
