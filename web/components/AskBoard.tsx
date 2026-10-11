"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ActionNote } from "./ActionNote";
import { Field } from "./ui/Field";
import { Badge } from "./ui/Badge";
import { Button, buttonClass } from "./ui/Button";
import { Money } from "./ui/Money";
import { answer, MAX_QUESTION, starterQuestions, type Answer, type AssistantFacts, type Draft, type Gap, type Parsed } from "@/lib/assistant";
import { demoKey, peekDemoState, useBoardState, useDemoState } from "@/lib/demo-state";
import type { AgingRow, PurchaseDoc, SalesDoc } from "@/lib/erp";
import type { Person } from "@/lib/sources/types";

type Entry = { id: string; question: string; hint?: Partial<Parsed>; aiMissed?: boolean; polished?: Record<number, string> };

const THREAD_KEY = "dropout:ask:thread";
const MAX_ENTRIES = 30;
const NO_ENTRIES: Entry[] = [];
const NO_AGING: AgingRow[] = [];
const NO_SALES: SalesDoc[] = [];
const NO_PURCHASES: PurchaseDoc[] = [];
const NO_PEOPLE: Person[] = [];
const NO_INVOICES: NonNullable<Extract<AssistantFacts["money"], { ok: true }>["data"]["einvoices"]> = [];

const GAP_LABEL: Record<Gap["reason"], string> = { off: "沒開", role: "沒有權限", error: "拿不到資料", missing: "沒有資料" };

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function Go({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return /^https?:/.test(href) ? (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Practice mode answers from the same browser-kept books as the other pages,
 * so a payment collected on 收錢 shows up here too.
 */
function usePracticeFacts(facts: AssistantFacts, packId: string): AssistantFacts {
  const live = facts.mode === "live";
  const [aging] = useBoardState(demoKey("aging", packId), facts.aging.ok ? facts.aging.data : NO_AGING, live);
  const [sales] = useBoardState(demoKey("sales", packId), facts.sales.ok ? facts.sales.data.docs : NO_SALES, live);
  const [inbox] = useBoardState(demoKey("inbox", packId), NO_SALES, live);
  const [purchases] = useBoardState(demoKey("purchases", packId), facts.purchases.ok ? facts.purchases.data.docs : NO_PURCHASES, live);
  const [leads] = useBoardState(demoKey("leads", packId), facts.people.ok ? facts.people.data : NO_PEOPLE, live);
  const [einvoices] = useBoardState(demoKey("einvoices", packId), facts.money.ok && facts.money.data.einvoices ? facts.money.data.einvoices : NO_INVOICES, live);

  return useMemo(() => {
    if (live) return facts;
    const dated = new Map((facts.sales.ok ? facts.sales.data.docs : []).map((d) => [d.no, d]));
    const withDates = (d: SalesDoc): SalesDoc => {
      const was = dated.get(d.no);
      if (!was) return d;
      return { ...d, date: d.date ?? was.date, due: d.due ?? (was.step === d.step ? was.due : undefined) };
    };
    const seen = new Set(sales.map((d) => d.no));
    return {
      ...facts,
      aging: facts.aging.ok ? { ok: true, data: aging } : facts.aging,
      sales: facts.sales.ok ? { ok: true, data: { ...facts.sales.data, docs: [...inbox.filter((d) => !seen.has(d.no)), ...sales].map(withDates) } } : facts.sales,
      purchases: facts.purchases.ok ? { ok: true, data: { ...facts.purchases.data, docs: purchases } } : facts.purchases,
      people: facts.people.ok ? { ok: true, data: leads } : facts.people,
      money: facts.money.ok ? { ok: true, data: { ...facts.money.data, einvoices: facts.money.data.einvoices ? einvoices : null } } : facts.money,
    };
  }, [live, facts, aging, sales, inbox, purchases, leads, einvoices]);
}

export function AskBoard({ facts: serverFacts, packId, ai: aiConfigured, initial }: { facts: AssistantFacts; packId: string; ai: boolean; initial: string }) {
  const facts = usePracticeFacts(serverFacts, packId);
  const [thread, setThread] = useDemoState<Entry[]>(THREAD_KEY, NO_ENTRIES);
  const [text, setText] = useState("");
  const [aiOn, setAiOn] = useState(aiConfigured);
  const [pending, setPending] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef<string | null>(null);

  const answers = useMemo(() => thread.map((entry) => ({ entry, a: answer(entry.question, facts, entry.hint) })), [thread, facts]);
  const starters = useMemo(() => starterQuestions(facts), [facts]);
  const latest = answers.at(-1);

  const update = (id: string, patch: (entry: Entry) => Entry) => setThread((prev) => prev.map((e) => (e.id === id ? patch(e) : e)));

  async function classify(id: string, question: string) {
    setPending((p) => [...p, id]);
    try {
      const res = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "classify", question }) });
      const body = (await res.json()) as { ok?: boolean; available?: boolean } & Partial<Parsed>;
      if (body.available === false) setAiOn(false);
      if (body.ok && body.intent) update(id, (e) => ({ ...e, hint: { intent: body.intent, period: body.period ?? null, name: body.name ?? null } }));
      else update(id, (e) => ({ ...e, aiMissed: true }));
    } catch {
      update(id, (e) => ({ ...e, aiMissed: true }));
    } finally {
      setPending((p) => p.filter((x) => x !== id));
    }
  }

  function ask(raw: string) {
    const question = raw.trim().slice(0, MAX_QUESTION);
    if (!question) return;
    const id = newId();
    setThread((prev) => [...prev, { id, question }].slice(-MAX_ENTRIES));
    setText("");
    setScrollTo(id);
    if (aiOn && !answer(question, facts).understood) void classify(id, question);
  }

  const askFromUrl = useEffectEvent((question: string) => {
    const last = peekDemoState<Entry[]>(THREAD_KEY, NO_ENTRIES).at(-1);
    if (last?.question !== question) ask(question);
  });

  useEffect(() => {
    if (!initial || asked.current === initial) return;
    asked.current = initial;
    askFromUrl(initial);
  }, [initial]);

  useEffect(() => {
    const el = scrollTo ? document.getElementById(`ask-${scrollTo}`) : null;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top >= 96 && top < window.innerHeight * 0.6) return;
    el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [scrollTo]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNote(`已複製（${value.length} 字），可以貼到 LINE、Email 或對話。`);
    } catch {
      setNote("瀏覽器不讓複製，請長按文字自己選取。");
    }
  }

  async function polish(id: string, index: number, draft: Draft) {
    const key = `${id}:${index}`;
    setPending((p) => [...p, key]);
    try {
      const res = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "polish", draft: draft.text, facts: draft.facts }) });
      const body = (await res.json()) as { ok?: boolean; available?: boolean; polished?: boolean; text?: string; message?: string };
      if (body.available === false) {
        setAiOn(false);
        setNote(body.message ?? "AI 沒有接上。");
      } else if (body.ok && body.polished && body.text) {
        update(id, (e) => ({ ...e, polished: { ...e.polished, [index]: body.text! } }));
        setNote("AI 改好了。金額、日期、單號都檢查過沒被動到。");
      } else {
        setNote(body.ok ? "AI 改的版本動到了數字或漏了資料，所以保留原本的草稿。" : (body.message ?? "AI 暫時沒有回應，原本的草稿可以直接用。"));
      }
    } catch {
      setNote("AI 暫時沒有回應，原本的草稿可以直接用。");
    } finally {
      setPending((p) => p.filter((x) => x !== key));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(text);
    if (window.matchMedia("(pointer: coarse)").matches) input.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp" && !text && thread.length) {
      event.preventDefault();
      setText(thread[thread.length - 1].question);
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      setText("");
    }
  }

  function pick(question: string) {
    ask(question);
  }

  return (
    <div className="space-y-3">
      <div className="glass space-y-5 p-4 md:p-6">
        <ActionNote>{note}</ActionNote>
        <p className="sr-only" aria-live="polite">
          {latest ? latest.a.text : ""}
        </p>

        {thread.length ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">對話</h2>
              <Button variant="ghost" size="sm" onClick={() => setThread([])}>
                清空
              </Button>
            </div>
            <ol className="space-y-6" aria-label="問過的問題">
              {answers.map(({ entry, a }) => (
                <li key={entry.id} id={`ask-${entry.id}`} className="scroll-mt-24 space-y-2">
                  <p className="bubble bubble-out">{entry.question}</p>
                  <AnswerCard
                    a={a}
                    entry={entry}
                    facts={facts}
                    classifying={pending.includes(entry.id)}
                    polishing={(i) => pending.includes(`${entry.id}:${i}`)}
                    ai={aiOn}
                    onAsk={pick}
                    onCopy={copy}
                    onPolish={(i, d) => void polish(entry.id, i, d)}
                    onRestore={(i) => update(entry.id, (e) => ({ ...e, polished: Object.fromEntries(Object.entries(e.polished ?? {}).filter(([k]) => Number(k) !== i)) }))}
                  />
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="space-y-3">
            <h2 className="section-title">可以這樣問</h2>
            <div className="flex flex-wrap gap-2">
              {starters.map((q) => (
                <Button key={q} variant="secondary" size="sm" onClick={() => pick(q)}>
                  {q}
                </Button>
              ))}
            </div>
            <p className="text-xs text-cream-dim">
              也可以問某位客人（打名字）、「這週要做什麼」，或說「幫我寫催款訊息」。
              <Link href="/help/assistant" className="ml-1 underline hover:text-cream">
                看能問什麼
              </Link>
            </p>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="sticky-submit space-y-1.5 md:px-1">
        <div className="flex items-end gap-2">
          <Field label="你想知道什麼" className="min-w-0 flex-1">
            <input
              ref={input}
              className="field"
              value={text}
              maxLength={MAX_QUESTION}
              autoComplete="off"
              enterKeyHint="send"
              placeholder="例如：誰欠我們最多？"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            問
          </Button>
        </div>
        <p className="text-xs text-cream-dim">
          {aiOn ? "規則聽不懂的問題，會把這一句話交給 AI 判斷是哪一類；數字一律從帳上算，不會送出帳本。" : "不會送給 AI，全部用內建規則回答。"}
        </p>
      </form>
    </div>
  );
}

type CardProps = {
  a: Answer;
  entry: Entry;
  facts: AssistantFacts;
  classifying: boolean;
  polishing: (index: number) => boolean;
  ai: boolean;
  onAsk: (question: string) => void;
  onCopy: (text: string) => void;
  onPolish: (index: number, draft: Draft) => void;
  onRestore: (index: number) => void;
};

function AnswerCard({ a, entry, facts, classifying, polishing, ai, onAsk, onCopy, onPolish, onRestore }: CardProps) {
  return (
    <article className="ask-answer space-y-3" aria-label={`回答：${entry.question}`}>
      <div className="flex flex-wrap items-start gap-2">
        {a.gap ? <Badge tone={a.gap.reason === "error" ? "danger" : "warn"}>{GAP_LABEL[a.gap.reason]}</Badge> : null}
        <p className="min-w-0 flex-1 leading-relaxed">{a.text}</p>
      </div>

      {classifying ? (
        <p className="flex items-center gap-2 text-sm text-cream-dim" role="status">
          <span className="spinner" aria-hidden="true" />
          請 AI 判斷這題是哪一類…
        </p>
      ) : null}
      {!a.understood && entry.aiMissed ? <p className="text-sm text-cream-dim">AI 也判斷不出來。</p> : null}
      {entry.hint?.intent && a.understood ? <p className="text-xs text-cream-dim">題目類型由 AI 判斷；數字仍然從帳上算。</p> : null}

      {a.figures.length ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {a.figures.map((fig) => (
            <div key={fig.label} className="glass-well min-w-0 p-3">
              <dt className="text-xs text-cream-dim">{fig.label}</dt>
              <dd className="mt-0.5 text-base font-medium md:text-lg">
                {fig.amount !== undefined ? (
                  <Money amount={fig.amount} tone={fig.tone ?? "auto"} />
                ) : (
                  <span className="money" data-tone={fig.tone}>
                    {fig.value}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {a.rows.length ? (
        <ul className="ask-rows">
          {a.rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium [overflow-wrap:anywhere]">
                  {row.href ? (
                    <Go href={row.href} className="underline decoration-[var(--line)] underline-offset-4 hover:decoration-current">
                      {row.label}
                    </Go>
                  ) : (
                    row.label
                  )}
                </p>
                {row.detail ? <p className="text-xs text-cream-dim [overflow-wrap:anywhere]">{row.detail}</p> : null}
              </div>
              {row.amount !== undefined ? <Money amount={row.amount} tone={row.tone ?? "auto"} className="shrink-0" /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {a.drafts.map((d, i) => (
        <DraftCard key={`${d.kind}-${d.to}`} draft={d} text={entry.polished?.[i] ?? d.text} polished={entry.polished?.[i] !== undefined} pending={polishing(i)} chatHref={facts.chatHref} ai={ai} onCopy={onCopy} onPolish={() => onPolish(i, d)} onRestore={() => onRestore(i)} />
      ))}

      {a.source ? <p className="text-xs text-cream-dim">出處：{a.source}</p> : null}

      {a.link || a.follow.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {a.link ? (
            <Go href={a.link.href} className={buttonClass({ variant: "secondary", size: "sm" })}>
              {a.link.label}
            </Go>
          ) : null}
          {a.follow.map((q) => (
            <button key={q} type="button" className="ask-chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function DraftCard({ draft, text, polished, pending, chatHref, ai, onCopy, onPolish, onRestore }: { draft: Draft; text: string; polished: boolean; pending: boolean; chatHref: string | null; ai: boolean; onCopy: (text: string) => void; onPolish: () => void; onRestore: () => void }) {
  return (
    <section className="glass-well space-y-3 p-4" aria-label={draft.title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">幫我寫：{draft.title}</h3>
        {polished ? <Badge tone="ok">AI 潤過</Badge> : null}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onCopy(text)}>
          複製
        </Button>
        {chatHref ? (
          <a href={chatHref} className={buttonClass({ variant: "ghost", size: "sm" })} onClick={() => onCopy(text)} {...(chatHref.startsWith("/api/") ? { target: "_blank", rel: "noreferrer" } : {})}>
            複製並打開對話
          </a>
        ) : null}
        {ai && !polished ? (
          <Button variant="ghost" size="sm" pending={pending} pendingLabel="AI 改寫中…" onClick={onPolish}>
            讓 AI 潤一下
          </Button>
        ) : null}
        {polished ? (
          <Button variant="ghost" size="sm" onClick={onRestore}>
            改回原本
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-cream-dim">金額、日期、單號都是帳上的。送出前請再看一次。{ai ? "AI 只改說法，動到數字的版本會自動作廢。" : ""}</p>
    </section>
  );
}
