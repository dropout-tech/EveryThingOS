"use client";

import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, AdvanceButton, useLiveAction } from "./LiveAction";
import { buttonClass } from "./ui/Button";
import { demoKey, useBoardState } from "@/lib/demo-state";
import { advancePurchase, formatTwd, type PurchaseDoc } from "@/lib/erp";

type PurchaseBoardProps = {
  packId: string;
  inventory: boolean;
  fulfillment: string;
  initial: PurchaseDoc[];
  live?: boolean;
};

export function PurchaseBoard({ packId, inventory, fulfillment, initial, live = false }: PurchaseBoardProps) {
  const [rows, setRows] = useBoardState(demoKey("purchases", packId), initial, live);
  const [note, setNote] = useState<string | null>(null);
  const action = useLiveAction();

  function onAdvance(row: PurchaseDoc) {
    if (row.next === "完成") return;
    const next = advancePurchase(row);
    setRows((current) => current.map((item) => (item.no === row.no ? next : item)));
    setNote(`${row.no} 已${row.next}。入庫與應付在同一條，不必另開一張進貨單。`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cream-dim">
        {inventory
          ? "請購 → 進貨 → 入庫 → 應付。缺貨從倉庫點過來，不必另外找進貨單。"
          : `這一行沒有倉庫。交給客人的方式是「${fulfillment}」，這裡只記經常費用與外包。`}
      </p>
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      <div className="glass sm:overflow-x-auto">
        <table className="table-stack sm:min-w-[40rem]">
          <caption className="sr-only">進貨單</caption>
          <thead className="bg-ink-2">
            <tr>
              <th scope="col">對象</th>
              <th scope="col">單號</th>
              <th scope="col">項目</th>
              <th scope="col">金額</th>
              <th scope="col">現在</th>
              <th scope="col">下一步</th>
            </tr>
          </thead>
          <tbody>
            {live && !rows.length ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-cream-dim">
                  沒有待到貨或待付款的單
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.no}>
                <td data-primary="">{row.vendor}</td>
                <td data-label="單號">{row.no}</td>
                <td data-label="項目">{row.item}</td>
                <td data-label="金額">{formatTwd(row.amount)}</td>
                <td data-label="現在" className="text-cream-dim">{row.status}</td>
                <td data-label="下一步">
                  {live ? (
                    <span className="flex items-center gap-3">
                      <AdvanceButton doctype={row.doctype} name={row.no} label={row.next} run={action.run} busy={action.busy} className={buttonClass({ variant: "secondary", size: "sm" })} />
                      <DeskLink href={row.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                        打開
                      </DeskLink>
                    </span>
                  ) : row.next === "完成" ? (
                    <span className="text-cream-dim">完成</span>
                  ) : (
                    <button type="button" onClick={() => onAdvance(row)} className={buttonClass({ variant: "secondary", size: "sm" })}>
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
