"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { demoKey, peekDemoState, writeDemoState } from "@/lib/demo-state";
import { formatTwd, makePurchaseRequest, type PurchaseDoc, type StockRow } from "@/lib/erp";

type StockBoardProps = {
  packId: string;
  inventoryValue: number;
  batchOn: boolean;
  stock: StockRow[];
  purchases: PurchaseDoc[];
};

export function StockBoard({ packId, inventoryValue, batchOn, stock, purchases }: StockBoardProps) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

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
      <p className="text-sm text-cream-dim">
        低於安全庫存會變橘色。點「請購」就去進貨，不必記兩張單。
        貨值 {formatTwd(inventoryValue)}。
      </p>
      <ActionNote>{note}</ActionNote>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-ink-2 text-cream-dim">
            <tr>
              <th className="px-4 py-3">品號</th>
              <th className="px-4 py-3">名稱</th>
              <th className="px-4 py-3">倉</th>
              <th className="px-4 py-3">現有</th>
              <th className="px-4 py-3">安全</th>
              {batchOn ? <th className="px-4 py-3">批號</th> : null}
              <th className="px-4 py-3">下一步</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => {
              const low = row.onHand < row.safety;
              return (
                <tr key={row.sku} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{row.sku}</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">{row.warehouse}</td>
                  <td className={`px-4 py-3 ${low ? "text-orange" : ""}`}>{row.onHand}</td>
                  <td className="px-4 py-3">{row.safety}</td>
                  {batchOn ? <td className="px-4 py-3">{row.batch ?? "—"}</td> : null}
                  <td className="px-4 py-3">
                    {low ? (
                      <button type="button" onClick={() => requestBuy(row)} className="text-teal">
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
  );
}
