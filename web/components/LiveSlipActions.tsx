"use client";

import { useState } from "react";
import type { SalesDoc } from "@/lib/erp";
import { Button } from "./ui/Button";
import type { useLiveAction } from "./LiveAction";

/** Extra writes on a live sales order. These buttons stay ghost, so the page keeps its one primary. */
export function LiveSlipActions({ doc, run, busy }: { doc: SalesDoc; run: ReturnType<typeof useLiveAction>["run"]; busy: boolean }) {
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("");
  if (doc.doctype !== "Sales Order") return null;
  const deposit = Number(amount.replace(/[,，\s]/g, ""));
  const ship = Number(qty.replace(/[,，\s]/g, ""));
  const waiting = typeof doc.orderedQty === "number" && typeof doc.deliveredQty === "number" && doc.orderedQty > doc.deliveredQty;
  const canReturn = Boolean(doc.deliveryNote);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="訂金" aria-label="訂金金額" className="field w-24" />
        <Button
          variant="ghost"
          disabled={busy || !(deposit > 0)}
          onClick={() => void run("/api/erp/deposit", { sales_order: doc.no, amount: deposit }, () => `${doc.no} 已收訂金`)}
        >
          收訂金
        </Button>
      </div>
      {waiting || canReturn ? (
        <div className="flex flex-wrap items-center gap-2">
          <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" placeholder="這次數量" aria-label="這次數量" className="field w-24" />
          {waiting ? (
            <Button
              variant="ghost"
              disabled={busy || !(ship > 0)}
              onClick={() => void run("/api/erp/partial", { sales_order: doc.no, qty: ship }, (result) => `${doc.no} 已出 ${String((result as { qty?: number }).qty ?? ship)}`)}
            >
              出這次
            </Button>
          ) : null}
          {canReturn ? (
            <Button
              variant="ghost"
              disabled={busy || !(ship > 0)}
              onClick={() => void run("/api/erp/return", { delivery_note: doc.deliveryNote, qty: ship }, () => `${doc.deliveryNote} 已退 ${ship}`)}
            >
              退這次
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
