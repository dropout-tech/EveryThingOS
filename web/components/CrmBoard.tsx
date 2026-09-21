"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { demoKey, peekDemoState, useDemoState, writeDemoState } from "@/lib/demo-state";
import { makeQuote, type SalesDoc } from "@/lib/erp";
import type { IndustryPack } from "@/lib/types";

type Lead = { name: string; stage: string; score: number; channel: string };

type CrmBoardProps = {
  pack: Pick<IndustryPack, "id" | "itemType" | "fulfillment" | "modules" | "workflow">;
  initial: Lead[];
};

export function CrmBoard({ pack, initial }: CrmBoardProps) {
  const router = useRouter();
  const stages = pack.workflow.stages;
  const [leads, setLeads] = useDemoState(demoKey("leads", pack.id), initial);
  const [note, setNote] = useState<string | null>(null);

  function onNext(lead: Lead) {
    const index = stages.indexOf(lead.stage);
    const last = index >= stages.length - 1;
    if (!last) {
      const stage = stages[index + 1];
      setLeads((current) => current.map((item) => (item.name === lead.name ? { ...item, stage } : item)));
      setNote(`${lead.name} 移到「${stage}」。階段名稱來自產業包，不是寫死的 CRM 漏斗。`);
      return;
    }

    const quote = makeQuote({
      party: lead.name,
      item: pack.itemType,
      amount: 12800 + lead.score * 80,
      pack,
    });
    if (!quote) return;
    const inbox = peekDemoState<SalesDoc[]>(demoKey("inbox", pack.id), []);
    writeDemoState(demoKey("inbox", pack.id), [quote, ...inbox]);
    setLeads((current) => current.filter((item) => item.name !== lead.name));
    setNote(`${lead.name} 已變成報價 ${quote.no}。同一個人，不必在 CRM 再建立一次客戶。`);
    window.setTimeout(() => router.push("/workspace/erp/sales"), 700);
  }

  const columns = stages.map((stage) => ({
    stage,
    cards: leads.filter((lead) => lead.stage === stage),
  }));

  return (
    <div className="space-y-4">
      <ActionNote>{note}</ActionNote>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
        {columns.map((column) => (
          <section key={column.stage} className="glass p-3">
            <h3 className="text-sm text-teal">{column.stage}</h3>
            <ul className="mt-3 space-y-2">
              {column.cards.length ? (
                column.cards.map((lead) => {
                  const last = stages.indexOf(lead.stage) >= stages.length - 1;
                  return (
                    <li key={lead.name} className="glass p-3">
                      <p>{lead.name}</p>
                      <p className="mt-1 text-xs text-cream-dim">
                        {lead.channel} · 計分 {lead.score}
                      </p>
                      <button type="button" onClick={() => onNext(lead)} className="mt-2 text-xs text-teal">
                        {last ? "轉成一張報價" : "下一步：跟進"}
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="text-xs text-cream-dim">這一格目前沒人</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
