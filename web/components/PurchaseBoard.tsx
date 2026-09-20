"use client";

import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { demoKey, useDemoState } from "@/lib/demo-state";
import { advancePurchase, formatTwd, type PurchaseDoc } from "@/lib/erp";

type PurchaseBoardProps = {
  packId: string;
  inventory: boolean;
  fulfillment: string;
  initial: PurchaseDoc[];
};

export function PurchaseBoard({ packId, inventory, fulfillment, initial }: PurchaseBoardProps) {
  const [rows, setRows] = useDemoState(demoKey("purchases", packId), initial);
  const [note, setNote] = useState<string | null>(null);

  function onAdvance(row: PurchaseDoc) {
    if (row.next === "完成") return;
    const next = advancePurchase(row);
    setRows((current) => current.map((item) => (item.no === row.no ? next : item)));
    setNote(`${row.no} 已${row.next}。入庫與應付在同一條，不必另開進貨單程式。`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cream-dim">
        {inventory
          ? "請購 → 進貨 → 入庫 → 應付。缺料從倉庫卡片過來，不必先找「進貨單」程式。"
          : `這包關掉倉庫。履行是「${fulfillment}」，這裡只剩經常費用與外包。`}
      </p>
      <ActionNote>{note}</ActionNote>
      <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-ink-2 text-cream-dim">
            <tr>
              <th className="px-4 py-3">單號</th>
              <th className="px-4 py-3">對象</th>
              <th className="px-4 py-3">項目</th>
              <th className="px-4 py-3">金額</th>
              <th className="px-4 py-3">現在</th>
              <th className="px-4 py-3">下一步</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.no} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{row.no}</td>
                <td className="px-4 py-3">{row.vendor}</td>
                <td className="px-4 py-3">{row.item}</td>
                <td className="px-4 py-3">{formatTwd(row.amount)}</td>
                <td className="px-4 py-3 text-cream-dim">{row.status}</td>
                <td className="px-4 py-3">
                  {row.next === "完成" ? (
                    <span className="text-cream-dim">完成</span>
                  ) : (
                    <button type="button" onClick={() => onAdvance(row)} className="text-teal">
                      {row.next}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
