"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { EmptyState } from "./EmptyState";
import { LiveLeadForm } from "./LiveLeadForm";
import { Avatar } from "./ui/Avatar";
import { buttonClass } from "./ui/Button";
import { Drawer } from "./ui/Drawer";
import { SearchBox } from "./ui/SearchBox";
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
  const [query, setQuery] = useState("");
  const [openName, setOpenName] = useState<string | null>(null);
  const opened = leads.find((lead) => lead.name === openName) ?? null;

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

  const needle = query.trim().toLowerCase();
  const shown = needle ? leads.filter((lead) => `${lead.name} ${lead.channel}`.toLowerCase().includes(needle)) : leads;
  const columns = stages.map((stage) => ({
    stage,
    cards: shown.filter((lead) => lead.stage === stage),
  }));
  const nextLabel = (lead: Lead) => {
    const index = stages.indexOf(lead.stage);
    return index >= stages.length - 1 ? "轉成一筆生意" : `下一步：${stages[index + 1]}`;
  };

  return (
    <div className="space-y-4">
      {live ? <LiveLeadForm /> : null}
      <ActionNote>{note}</ActionNote>
      {leads.length ? (
        <div className="toolbar" id="find">
          <SearchBox label="找客人" placeholder="名字或從哪來，例如 LINE" value={query} onChange={setQuery} />
          <p className="text-xs text-cream-dim" role="status">
            {needle ? `找到 ${shown.length} 位` : `共 ${leads.length} 位`}
          </p>
        </div>
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {columns.map((column) => (
          <section key={column.stage} className="glass-well p-3">
            <h2 className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{live ? stageLabel(column.stage) : column.stage}</span>
              <span className="badge-count">{column.cards.length}</span>
            </h2>
            <ul className="mt-3 space-y-2">
              {column.cards.length ? (
                column.cards.map((lead) => {
                  const stageIndex = stages.indexOf(lead.stage);
                  const last = stageIndex >= stages.length - 1;
                  return (
                    <li key={lead.href ?? lead.name} className="glass-chip p-3">
                      <button type="button" className="flex w-full items-center gap-2 text-left" aria-haspopup="dialog" onClick={() => setOpenName(lead.name)}>
                        <Avatar name={lead.name} />
                        <span className="min-w-0">
                          <span className="block truncate underline decoration-[color-mix(in_srgb,currentColor_30%,transparent)] underline-offset-4">{lead.name}</span>
                          <span className="block text-xs text-cream-dim">{lead.channel}</span>
                        </span>
                      </button>
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
                        <button type="button" onClick={() => onNext(lead)} className={buttonClass({ variant: last ? "primary" : "secondary", size: "sm", block: true, className: "mt-2" })}>
                          {nextLabel(lead)}
                        </button>
                      )}
                    </li>
                  );
                })
              ) : (
                <li className="text-xs text-cream-dim">{needle ? "這一格沒有符合的人" : "這一格目前沒人"}</li>
              )}
            </ul>
          </section>
        ))}
      </div>
      <Drawer
        open={Boolean(opened)}
        title={opened?.name ?? ""}
        onClose={() => setOpenName(null)}
        footer={
          opened ? (
            live ? (
              <>
                <a href="/workspace/erp/sales#new-quote" className={buttonClass({ variant: "primary" })}>
                  開報價
                </a>
                <DeskLink href={opened.href} className={buttonClass({ variant: "secondary" })}>
                  在 ERPNext 打開
                </DeskLink>
              </>
            ) : (
              <button
                type="button"
                className={buttonClass({ variant: "primary" })}
                onClick={() => {
                  onNext(opened);
                  setOpenName(null);
                }}
              >
                {nextLabel(opened)}
              </button>
            )
          ) : null
        }
      >
        {opened ? (
          <dl>
            <dt>現在在</dt>
            <dd>{live ? stageLabel(opened.stage) : opened.stage}</dd>
            <dt>從哪來</dt>
            <dd>{opened.channel}</dd>
            {opened.score ? (
              <>
                <dt>熱度</dt>
                <dd className="num">{opened.score}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Drawer>
    </div>
  );
}
