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
};

export function StockBoard({ packId, inventoryValue, batchOn, stock, courseBoms = [], purchases, live = false, deskUrl }: StockBoardProps) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const focus = nextStock(stock);
  const others = stock.filter((row) => row.onHand < row.safety).length - (focus ? 1 : 0);

  function requestBuy(row: StockRow) {
    const existing = peekDemoState<PurchaseDoc[]>(demoKey("purchases", packId), purchases);
    const po = makePurchaseRequest({
      sku: row.sku,
      name: row.name,
      amount: Math.max(1, (row.safety - row.onHand) * 800),
    });
    writeDemoState(demoKey("purchases", packId), [po, ...existing.filter((item) => item.no !== po.no)]);
    setNote(`已為「${row.name}」開請購 ${po.no}。直接去採購頁轉進貨。`);
    window.setTimeout(() => router.push("/workspace/erp/purchase"), 600);
  }

  function requestBomShortage(items: { sku: string; name: string; shortage: number }[], courseName: string) {
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
        低於安全庫存會標「不夠」。點「請購」就去進貨，不必記兩張單。
        貨值 {formatTwd(inventoryValue)}。
      </p>
      <ActionNote>{note}</ActionNote>
      {focus ? (
        <NextThing
          title={`${focus.name} 不夠`}
          detail={`現有 ${focus.onHand}，安全量 ${focus.safety}。請購之後去進貨。${others > 0 ? `下面還有 ${others} 項不夠。` : ""}`}
          action={
            deskUrl ? (
              <DeskLink href={`${deskUrl}/app/material-request/new?material_request_type=Purchase`} className={buttonClass({ variant: "primary" })}>
                請購
              </DeskLink>
            ) : (
              <button type="button" onClick={() => requestBuy(focus)} className={buttonClass({ variant: "primary" })}>
                請購
              </button>
            )
          }
        />
      ) : null}
      <div className="glass sm:overflow-x-auto">
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
                    {deskUrl ? (
                      low ? (
                        <DeskLink href={`${deskUrl}/app/material-request/new?material_request_type=Purchase`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                          請購
                        </DeskLink>
                      ) : (
                        <DeskLink href={row.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                          打開
                        </DeskLink>
                      )
                    ) : low ? (
                      <button type="button" onClick={() => requestBuy(row)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                        請購
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
      <CourseBomBoard
        initialBoms={courseBoms}
        stock={stock}
        live={live}
        deskUrl={deskUrl}
        onRequestShortage={requestBomShortage}
        onPracticeNote={setNote}
      />
    </div>
  );
}
