"use client";

import { useState, type FormEvent } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";

const field = "mt-1 w-full rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream";

/** 寫一封: plain text in, ERPNext Newsletter out. Sending uses ERPNext's queue, unsubscribe link and Email Group opt-outs. */
export function LetterComposer({ groups }: { groups: { name: string; title: string; subscribers: number }[] }) {
  const action = useLiveAction();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<string[]>(groups[0] ? [groups[0].name] : []);
  const reach = groups.filter((g) => picked.includes(g.name)).reduce((n, g) => n + g.subscribers, 0);

  async function submit(event: FormEvent, send: boolean) {
    event.preventDefault();
    if (send && !window.confirm(`現在寄給約 ${reach} 人？寄出後不能收回。`)) return;
    const result = await action.run("/api/letter/newsletter", { subject, message, email_groups: picked, send }, (r) =>
      send ? `已排入寄送，約 ${r.recipients} 人。退訂的人會自動略過。` : `已存成草稿「${subject}」，會寄給約 ${r.recipients} 人。`,
    );
    if (result?.ok) {
      setSubject("");
      setMessage("");
    }
  }

  if (!groups.length) return <p className="text-sm text-cream-dim">還沒有名單。官網表單有人同意後，會自動進「新朋友」。</p>;

  return (
    <form onSubmit={(e) => submit(e, false)} className="glass space-y-3 p-4">
      <label className="block text-sm">
        <span className="block text-xs text-cream-dim">主旨</span>
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={field} />
      </label>
      <label className="block text-sm">
        <span className="block text-xs text-cream-dim">內容（空一行就是新段落）</span>
        <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className={field} />
      </label>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 text-xs text-cream-dim">寄給</legend>
        {groups.map((g) => (
          <label key={g.name} className="glass-chip flex items-center gap-2 px-3 py-1.5">
            <input type="checkbox" checked={picked.includes(g.name)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, g.name] : p.filter((x) => x !== g.name)))} />
            {g.title}（{g.subscribers}）
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={action.busy || !picked.length} className="glass-pill px-4 py-2 text-sm disabled:opacity-50">
          存草稿
        </button>
        <button type="button" disabled={action.busy || !picked.length || !subject || !message} onClick={(e) => submit(e, true)} className="glass-cta rounded-full px-4 py-2 text-sm disabled:opacity-50">
          {action.busy ? "處理中…" : "現在寄出"}
        </button>
        <span className="text-xs text-cream-dim">每封信最下面都有一鍵退訂。</span>
      </div>
      <ActionOutcomeNote outcome={action.outcome} />
    </form>
  );
}

export function SendDraftButton({ name, subject }: { name: string; subject: string }) {
  const action = useLiveAction();
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={action.busy}
        className="text-xs text-teal disabled:opacity-40"
        onClick={() => window.confirm(`現在寄出「${subject}」？`) && action.run("/api/letter/send", { name }, (r) => `已排入寄送，約 ${r.recipients} 人。`)}
      >
        {action.busy ? "寄送中…" : "寄出"}
      </button>
      {action.outcome ? <span className={`text-xs ${action.outcome.ok ? "text-cream-dim" : "text-orange"}`}>{action.outcome.message}</span> : null}
    </span>
  );
}
