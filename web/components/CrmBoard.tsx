"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { NextThing } from "./NextThing";
import { EmptyState } from "./EmptyState";
import { LiveLeadForm } from "./LiveLeadForm";
import { buttonClass } from "./ui/Button";
import { demoKey, peekDemoState, useBoardState, writeDemoState } from "@/lib/demo-state";
import { makeQuote, type SalesDoc } from "@/lib/erp";
import { nextLead } from "@/lib/next-thing";
import { beatByStep } from "@/lib/tw-real";
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

  const focus = nextLead(leads, stages);
  const stageIndex = focus ? stages.indexOf(focus.stage) : -1;
  const lastFocus = focus != null && stageIndex >= stages.length - 1;
  const shownStage = (stage: string) => (live ? stageLabel(stage) : stage);
  const here = !live && focus ? beatByStep(pack.workflow.id, focus.stage) : undefined;
  const nextName = focus && !lastFocus ? shownStage(stages[stageIndex + 1]) : "";
  const columns = stages.map((stage) => ({
    stage,
    cards: leads.filter((lead) => lead.stage === stage),
  }));

  return (
    <div className="space-y-4">
      {live ? <LiveLeadForm emphasis={leads.length ? "secondary" : "primary"} /> : null}
      <ActionNote>{note}</ActionNote>
      {focus ? (
        <NextThing
          title={focus.name}
          detail={
            live
              ? `跟到「${shownStage(focus.stage)}」。報價從這個人開，不必再建一次。`
              : lastFocus
                ? `${here?.detail ?? "已經跟到最後一步。"}轉成一筆生意後，同一個人進報價。`
                : here
                  ? `${here.detail}下一步是「${nextName}」。`
                  : `還在「${shownStage(focus.stage)}」。下一步是「${nextName}」。`
          }
          action={
            live ? (
              <a href="/workspace/erp/sales" className={buttonClass({ variant: "primary" })}>
                開報價
              </a>
            ) : (
              <button type="button" onClick={() => onNext(focus)} className={buttonClass({ variant: "primary" })}>
                {lastFocus ? "轉成一筆生意" : `下一步：${shownStage(stages[stageIndex + 1])}`}
              </button>
            )
          }
        />
      ) : null}
      {live && !leads.length ? (
        <EmptyState
          compact
          title="還沒有客人"
          detail="LINE、IG、官網表單來的人會自動出現在這裡；舊客人名單可以一次匯入。"
          action={{ href: "/help/import-data#customers", label: "匯入客人名單" }}
          secondary={{ href: "/workspace/chat", label: "接上對話" }}
          help="module-crm"
        />
      ) : null}
      {!live && stages.length > 5 ? (
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="這十步">
          {stages.map((stage, index) => {
            const cards = leads.filter((lead) => lead.stage === stage);
            const current = focus?.stage === stage;
            const beat = beatByStep(pack.workflow.id, stage);
            return (
              <li key={stage} className="glass-chip p-3">
                <p className="text-xs text-cream-dim">
                  {index + 1} / {stages.length}
                  {current ? " · 現在" : ""}
                </p>
                <p className="font-medium">{stage}</p>
                {beat ? <p className="mt-1 text-xs text-cream-dim">{beat.detail}</p> : null}
                {cards.length ? (
                  <ul className="mt-2 space-y-2">
                    {cards.map((lead) => {
                      const at = stages.indexOf(lead.stage);
                      const last = at >= stages.length - 1;
                      return (
                        <li key={lead.name}>
                          <p className="text-sm">{lead.name}</p>
                          <p className="text-xs text-cream-dim">{lead.channel}</p>
                          <button type="button" onClick={() => onNext(lead)} className={buttonClass({ variant: "secondary", size: "sm", block: true, className: "mt-2" })}>
                            {last ? "轉成一筆生意" : `下一步：${stages[at + 1]}`}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-cream-dim">還沒到這一步</p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {columns.map((column) => (
          <section key={column.stage} className="glass-well p-3">
            <h2 className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <span>{live ? stageLabel(column.stage) : column.stage}</span>
              <span className="text-xs font-normal text-cream-dim">{column.cards.length}</span>
            </h2>
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
                        <span className="mt-2 flex gap-2">
                          <DeskLink href={lead.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
                            打開
                          </DeskLink>
                          <a href="/workspace/erp/sales" className={buttonClass({ variant: "secondary", size: "sm" })}>
                            開報價
                          </a>
                        </span>
                      ) : (
                        <button type="button" onClick={() => onNext(lead)} className={buttonClass({ variant: "secondary", size: "sm", block: true, className: "mt-2" })}>
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
      )}
    </div>
  );
}
