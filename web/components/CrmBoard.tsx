"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { demoKey, peekDemoState, useBoardState, writeDemoState } from "@/lib/demo-state";
import { makeQuote, type SalesDoc } from "@/lib/erp";
import type { IndustryPack } from "@/lib/types";

type Lead = { name: string; stage: string; score: number; channel: string; href?: string };

type CrmBoardProps = {
  pack: Pick<IndustryPack, "id" | "itemType" | "fulfillment" | "modules" | "workflow">;
  initial: Lead[];
  live?: boolean;
};

/** ERPNext Lead statuses in the order a lead moves, then customers. */
const LIVE_STAGES: [string, string][] = [
  ["Lead", "新名單"],
  ["Open", "跟進中"],
  ["Replied", "已回覆"],
  ["Interested", "有興趣"],
  ["Opportunity", "有機會"],
  ["Quotation", "已報價"],
  ["Lost Quotation", "報價沒成"],
  ["客人", "客人"],
];

function liveStages(leads: Lead[]) {
  const present = new Set(leads.map((lead) => lead.stage));
  const known = LIVE_STAGES.filter(([id]) => present.has(id)).map(([id]) => id);
  const other = [...present].filter((id) => !LIVE_STAGES.some(([known]) => known === id));
  return [...known, ...other];
}

const stageLabel = (stage: string) => LIVE_STAGES.find(([id]) => id === stage)?.[1] ?? stage;

export function CrmBoard({ pack, initial, live = false }: CrmBoardProps) {
  const router = useRouter();
  const [leads, setLeads] = useBoardState(demoKey("leads", pack.id), initial, live);
  const stages = live ? liveStages(leads) : pack.workflow.stages;
  const [note, setNote] = useState<string | null>(null);

  function onNext(lead: Lead) {
    const index = stages.indexOf(lead.stage);
    const last = index >= stages.length - 1;
    if (!last) {
      const stage = stages[index + 1];
      setLeads((current) => current.map((item) => (item.name === lead.name ? { ...item, stage } : item)));
      setNote(`${lead.name} → ${stage}`);
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
    setNote(`${lead.name} 變成 ${quote.no}`);
    window.setTimeout(() => router.push("/workspace/erp/sales"), 700);
  }

  const columns = stages.map((stage) => ({
    stage,
    cards: leads.filter((lead) => lead.stage === stage),
  }));

  return (
    <div className="space-y-4">
      <ActionNote>{note}</ActionNote>
      {live && !leads.length ? <p className="text-sm text-cream-dim">還沒有客人。對話、官網表單或匯入後會出現在這裡。</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {columns.map((column) => (
          <section key={column.stage} className="glass-well p-3">
            <h3 className="text-sm">{live ? stageLabel(column.stage) : column.stage}</h3>
            <ul className="mt-3 space-y-2">
              {column.cards.length ? (
                column.cards.map((lead) => {
                  const stageIndex = stages.indexOf(lead.stage);
                  const last = stageIndex >= stages.length - 1;
                  return (
                    <li key={lead.href ?? lead.name} className="glass-chip p-3">
                      <p>{lead.name}</p>
                      <p className="mt-1 text-xs text-cream-dim">{lead.channel}</p>
                      {live ? (
                        <DeskLink href={lead.href} className="mt-2 inline-block text-xs text-cream">
                          打開
                        </DeskLink>
                      ) : (
                        <button type="button" onClick={() => onNext(lead)} className="mt-2 text-xs text-cream">
                          {last ? "轉成一筆生意" : `下一步：${stages[stageIndex + 1]}`}
                        </button>
                      )}
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
