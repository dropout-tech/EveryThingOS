"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionNote } from "./ActionNote";
import { demoKey, useDemoState } from "@/lib/demo-state";
import { matchRule, sanitizeImportedHandle, type ReplyComment, type ReplyRule } from "@/lib/reply";
import type { IndustryPack } from "@/lib/types";

type ReplyBoardProps = {
  pack: Pick<IndustryPack, "id" | "workflow">;
  initialRules: ReplyRule[];
  initialInbox: ReplyComment[];
};

export function ReplyBoard({ pack, initialRules, initialInbox }: ReplyBoardProps) {
  const router = useRouter();
  const [rules, setRules] = useDemoState(demoKey("reply-rules", pack.id), initialRules);
  const [inbox, setInbox] = useDemoState(demoKey("reply-inbox", pack.id), initialInbox);
  const [note, setNote] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [dm, setDm] = useState("");
  const [publicReply, setPublicReply] = useState("私訊發給你了");

  const waiting = inbox.filter((item) => item.status === "inbox");
  const sent = inbox.filter((item) => item.status === "sent");

  const preview = useMemo(() => {
    const sample = waiting[0]?.text ?? "價格";
    return matchRule(sample, rules);
  }, [waiting, rules]);

  function onSend(comment: ReplyComment) {
    const rule = matchRule(comment.text, rules);
    if (!rule) {
      setNote(`「${comment.text}」沒有命中關鍵字。加一條規則，或略過這則。OpenReply 也是這樣擋亂槍。`);
      return;
    }
    setInbox((current) =>
      current.map((item) =>
        item.id === comment.id ? { ...item, status: "sent", matched: rule.keyword } : item,
      ),
    );
    setNote(
      `示範：對 ${comment.handle} 送出私訊「${rule.dm}」。公開回覆「${rule.publicReply}」。Meta webhook 還沒接上，正式站會由 OpenReply 打 Graph API。`,
    );
  }

  function onSkip(comment: ReplyComment) {
    setInbox((current) =>
      current.map((item) => (item.id === comment.id ? { ...item, status: "skipped" } : item)),
    );
    setNote(`${comment.handle} 已略過。沒有關鍵字就不要洗私訊，這是 ManyChat 最常被關掉的原因。`);
  }

  function onLead(comment: ReplyComment) {
    const handle = sanitizeImportedHandle(comment.handle);
    if (!handle) {
      setNote("這個帳號格式不能進客人看板。");
      return;
    }
    const stage = pack.workflow.stages[0];
    setNote(`${handle} 進了客人看板「${stage}」。同一個人，不必再從 IG 手動複製。`);
    router.push(`/workspace/crm?from=${encodeURIComponent(handle)}`);
  }

  function onAddRule() {
    const nextKeyword = keyword.trim();
    const nextDm = dm.trim();
    if (!nextKeyword || !nextDm) {
      setNote("關鍵字和私訊內容都要填。不要做空規則。");
      return;
    }
    if (rules.some((rule) => rule.keyword.toLowerCase() === nextKeyword.toLowerCase())) {
      setNote(`「${nextKeyword}」已經有了。改現有規則，不要重複。`);
      return;
    }
    const rule: ReplyRule = {
      id: `r-${Date.now()}`,
      keyword: nextKeyword,
      dm: nextDm,
      publicReply: publicReply.trim() || "私訊發給你了",
      channel: "ig",
    };
    setRules((current) => [...current, rule]);
    setKeyword("");
    setDm("");
    setNote(`新增關鍵字「${rule.keyword}」。留言含這幾個字才會進私訊。`);
  }

  return (
    <div className="space-y-4">
      <ActionNote>{note}</ActionNote>
      <p className="glass-chip px-4 py-3 text-sm text-cream-dim">
        底層是 <span className="text-cream">OpenReply</span>（MIT）。命中才私訊。Meta webhook 還沒接。
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <section className="glass p-4">
          <h3 className="text-lg">等回的留言</h3>
          {waiting.length ? (
            <ul className="mt-3 space-y-3">
              {waiting.map((comment) => {
                const rule = matchRule(comment.text, rules);
                return (
                  <li key={comment.id} className="glass-chip p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{comment.handle}</p>
                      <p className="text-xs text-cream-dim">
                        {comment.channel.toUpperCase()} · {comment.post}
                      </p>
                    </div>
                    <p className="mt-2 text-cream">「{comment.text}」</p>
                    <p className="mt-2 text-xs text-cream-dim">
                      {rule ? `命中「${rule.keyword}」→ 私訊：${rule.dm}` : "沒有命中規則"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="glass-cta rounded-full px-3 py-1.5 text-xs" onClick={() => onSend(comment)}>
                        送出私訊
                      </button>
                      <button type="button" className="glass-pill px-3 py-1.5 text-xs" onClick={() => onSkip(comment)}>
                        略過
                      </button>
                      <button type="button" className="glass-pill px-3 py-1.5 text-xs" onClick={() => onLead(comment)}>
                        轉進客人看板
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="glass-chip p-4 text-sm text-cream-dim">這一輪留言都處理完了。</p>
          )}
          {sent.length ? (
            <p className="text-xs text-cream-dim">已送出 {sent.length} 則示範私訊。正式站由 OpenReply 寫 Meta 對話，再經事件進 CRM。</p>
          ) : null}
        </section>
        <aside className="glass space-y-3 p-4">
          <h3 className="text-lg">關鍵字 → 私訊</h3>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li key={rule.id} className="glass-chip p-3 text-sm">
                <p className="text-teal">{rule.keyword}</p>
                <p className="mt-1 text-cream-dim">{rule.dm}</p>
                <p className="mt-1 text-xs text-cream-dim">公開回覆：{rule.publicReply}</p>
              </li>
            ))}
          </ul>
          <form
            className="glass-chip space-y-2 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              onAddRule();
            }}
          >
            <p className="text-sm">加一條規則</p>
            <label className="block text-xs text-cream-dim">
              關鍵字
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-cream"
                maxLength={32}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs text-cream-dim">
              私訊
              <textarea
                value={dm}
                onChange={(event) => setDm(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-cream"
                rows={3}
                maxLength={280}
              />
            </label>
            <label className="block text-xs text-cream-dim">
              公開回覆
              <input
                value={publicReply}
                onChange={(event) => setPublicReply(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-cream"
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="glass-cta rounded-full px-4 py-2 text-sm">
              存規則
            </button>
            {preview ? (
              <p className="text-xs text-cream-dim">預覽命中：{preview.keyword}</p>
            ) : null}
          </form>
        </aside>
      </div>
    </div>
  );
}
