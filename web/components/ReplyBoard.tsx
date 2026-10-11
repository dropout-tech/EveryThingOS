"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionNote } from "./ActionNote";
import { Avatar } from "./ui/Avatar";
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
      setNote(`「${comment.text}」沒對到關鍵字。加一組，或略過這則。沒有關鍵字就不要洗私訊。`);
      return;
    }
    setInbox((current) =>
      current.map((item) =>
        item.id === comment.id ? { ...item, status: "sent", matched: rule.keyword } : item,
      ),
    );
    setNote(
      `已在這台電腦對 ${comment.handle} 寫好私訊「${rule.dm}」，公開回覆「${rule.publicReply}」。還沒真的傳到 Instagram。`,
    );
  }

  function onSkip(comment: ReplyComment) {
    setInbox((current) =>
      current.map((item) => (item.id === comment.id ? { ...item, status: "skipped" } : item)),
    );
    setNote(`${comment.handle} 已略過。沒有關鍵字就不要洗私訊，客人會把你關掉。`);
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
      setNote("關鍵字和私訊內容都要填。不要存空白的。");
      return;
    }
    if (rules.some((rule) => rule.keyword.toLowerCase() === nextKeyword.toLowerCase())) {
      setNote(`「${nextKeyword}」已經有了。改現有的，不要重複。`);
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
        留言出現關鍵字才私訊。現在按送出，還不會真的傳到 Instagram。
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <section className="glass p-4">
          <h2 className="text-lg font-medium">等回的留言</h2>
          {waiting.length ? (
            <ul className="mt-3 space-y-3">
              {waiting.map((comment) => {
                const rule = matchRule(comment.text, rules);
                return (
                  <li key={comment.id} className="glass-chip p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={comment.handle} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="bubble-meta">
                          <span className="font-medium text-cream">{comment.handle}</span> · {comment.channel.toUpperCase()} · {comment.post}
                        </p>
                        <p className="bubble">{comment.text}</p>
                      </div>
                    </div>
                    {rule ? (
                      <div className="mt-2 space-y-1">
                        <p className="bubble bubble-out">{rule.dm}</p>
                        <p className="bubble-meta">對到「{rule.keyword}」，會這樣私訊</p>
                      </div>
                    ) : (
                      <p className="bubble-meta mt-2">沒對到關鍵字</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onSend(comment)}>
                        送出私訊
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSkip(comment)}>
                        略過
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onLead(comment)}>
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
            <p className="text-xs text-cream-dim">已寫好 {sent.length} 則私訊。接上 Instagram 後，同一套動作會真的送出，並進客人。</p>
          ) : null}
        </section>
        <aside className="glass space-y-3 p-4">
          <h2 className="text-lg font-medium">關鍵字 → 私訊</h2>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li key={rule.id} className="glass-chip space-y-1 p-3 text-sm">
                <p className="font-medium">{rule.keyword}</p>
                <p className="bubble bubble-out">{rule.dm}</p>
                <p className="bubble-meta">公開回覆：{rule.publicReply}</p>
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
            <p className="text-sm">加一組關鍵字</p>
            <label className="block text-xs font-medium">
              關鍵字
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="field mt-1"
                maxLength={32}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-medium">
              私訊
              <textarea
                value={dm}
                onChange={(event) => setDm(event.target.value)}
                className="field mt-1"
                rows={3}
                maxLength={280}
              />
            </label>
            <label className="block text-xs font-medium">
              公開回覆
              <input
                value={publicReply}
                onChange={(event) => setPublicReply(event.target.value)}
                className="field mt-1"
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              存起來
            </button>
            {preview ? (
              <p className="text-xs text-cream-dim">這則會用關鍵字「{preview.keyword}」</p>
            ) : null}
          </form>
        </aside>
      </div>
    </div>
  );
}
