"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionNote } from "./ActionNote";
import { NextThing } from "./NextThing";
import { demoKey, peekDemoState, useDemoState, writeDemoState } from "@/lib/demo-state";
import { makeQuote } from "@/lib/erp";
import { matchRule, sanitizeImportedHandle, type ReplyComment, type ReplyRule } from "@/lib/reply";
import type { IndustryPack } from "@/lib/types";

type ReplyBoardProps = {
  pack: Pick<IndustryPack, "id" | "workflow" | "itemType" | "fulfillment" | "modules">;
  initialRules: ReplyRule[];
  initialInbox: ReplyComment[];
  /** The page already has one primary (the live inbox). This board stays quiet. */
  quiet?: boolean;
  commentToOrder?: boolean;
};

export function ReplyBoard({ pack, initialRules, initialInbox, quiet = false, commentToOrder = false }: ReplyBoardProps) {
  const router = useRouter();
  const [rules, setRules] = useDemoState(demoKey("reply-rules", pack.id), initialRules);
  const [inbox, setInbox] = useDemoState(demoKey("reply-inbox", pack.id), initialInbox);
  const [note, setNote] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [dm, setDm] = useState("");
  const [publicReply, setPublicReply] = useState("私訊發給你了");

  const waiting = inbox.filter((item) => item.status === "inbox");
  const sent = inbox.filter((item) => item.status === "sent");
  const hero = quiet ? null : waiting[0] ?? null;
  const heroRule = hero ? matchRule(hero.text, rules) : null;

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
    const key = demoKey("timeline", pack.id);
    const prev = peekDemoState<{ party: string; text: string }[]>(key, []);
    writeDemoState(key, [{ party: comment.handle, text: rule.publicReply }, ...prev].slice(0, 20));
    setNote(
      `已在這台電腦對 ${comment.handle} 寫好私訊「${rule.dm}」，公開回覆「${rule.publicReply}」。留在練習，客人頁看得到今天回過。還沒真的傳到 Instagram，規則也還沒在上面跑。`,
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
    if (commentToOrder) {
      const quote = makeQuote({ party: handle, item: comment.text.slice(0, 40), amount: 1, pack, taxable: false, invoiceable: false });
      if (quote) {
        const inboxKey = demoKey("inbox", pack.id);
        const existing = peekDemoState<typeof quote[]>(inboxKey, []);
        writeDemoState(inboxKey, [quote, ...existing]);
      }
    }
    setNote(`${handle} 進了客人看板「${stage}」。${commentToOrder ? "這則留言也成了一張未稅單。" : "同一個人，不必再從 IG 手動複製。"}`);
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
      {hero ? (
        <NextThing
          title={`${hero.handle} 的留言在等`}
          detail={heroRule ? `「${hero.text}」。對到「${heroRule.keyword}」，私訊會寫「${heroRule.dm}」。` : `「${hero.text}」。沒對到關鍵字就不要洗私訊，先略過或加一組。`}
          action={
            <button type="button" className="btn btn-primary" onClick={() => onSend(hero)}>
              送出私訊
            </button>
          }
        />
      ) : null}
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
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{comment.handle}</p>
                      <p className="text-xs text-cream-dim">
                        {comment.channel.toUpperCase()} · {comment.post}
                      </p>
                    </div>
                    <p className="mt-2 text-cream">「{comment.text}」</p>
                    <p className="mt-2 text-xs text-cream-dim">
                      {rule ? `對到「${rule.keyword}」→ 私訊：${rule.dm}` : "沒對到關鍵字"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSend(comment)}>
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
              <li key={rule.id} className="glass-chip p-3 text-sm">
                <p className="font-medium">{rule.keyword}</p>
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
            <button type="submit" className={quiet || hero ? "btn btn-secondary" : "btn btn-primary"}>
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
