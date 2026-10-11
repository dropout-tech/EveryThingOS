"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { Money } from "./ui/Money";
import { demoKey, peekDemoState, useDemoState, writeDemoState } from "@/lib/demo-state";
import { makePurchaseRequest, type PurchaseDoc, type StockRow } from "@/lib/erp";

type StockBoardProps = {
  packId: string;
  inventoryValue: number;
  batchOn: boolean;
  stock: StockRow[];
  purchases: PurchaseDoc[];
  deskUrl?: string;
};

const NONE: StockRow[] = [];

export function StockBoard({ packId, inventoryValue, batchOn, stock: books, purchases, deskUrl }: StockBoardProps) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  // 示範模式：匯入資料精靈放進來的商品（還沒有庫存）接在後面。
  const [imported] = useDemoState(demoKey("stock-imported", packId), NONE);
  const stock = deskUrl ? books : [...books, ...imported.filter((row) => !books.some((b) => b.sku === row.sku))];

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

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-cream-dim">
        <span>
          貨值 <Money amount={inventoryValue} className="font-medium text-cream" />
        </span>
        <span>低於安全量會標「不夠」，按「請購」就去進貨。</span>
      </p>
      <ActionNote>{note}</ActionNote>
      <div className="glass">
        <div className="sm:overflow-x-auto">
          <table className="table-stack sm:min-w-[40rem]">
            <caption className="sr-only">庫存</caption>
            <thead className="bg-ink-2">
              <tr>
                <th scope="col">名稱</th>
                <th scope="col">品號</th>
                <th scope="col">倉</th>
                <th scope="col" className="num" data-numeric="">現有</th>
                <th scope="col" className="num" data-numeric="">安全</th>
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
                    <td data-label="現有" className="num" data-numeric="">
                      <span className={`inline-flex items-center gap-2 ${low ? "font-medium text-warn" : ""}`}>
                        {row.onHand}
                        {low ? <Badge tone="warn">不夠</Badge> : null}
                      </span>
                    </td>
                    <td data-label="安全" className="num" data-numeric="">
                      {row.safety}
                    </td>
                    {batchOn ? <td data-label="批號">{row.batch ?? "—"}</td> : null}
                    <td data-label="下一步">
                      {deskUrl ? (
                        low ? (
                          <DeskLink href={`${deskUrl}/app/material-request/new?material_request_type=Purchase`} className={buttonClass({ variant: "primary", size: "sm" })}>
                            請購
                          </DeskLink>
                        ) : (
                          <DeskLink href={row.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                            打開
                          </DeskLink>
                        )
                      ) : low ? (
                        <button type="button" onClick={() => requestBuy(row)} className={buttonClass({ variant: "primary", size: "sm" })}>
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
      </div>
    </div>
  );
}
