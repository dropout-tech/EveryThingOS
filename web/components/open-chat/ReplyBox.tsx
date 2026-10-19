"use client";

import { useState } from "react";
import { samePerson, samePersonReason } from "@/lib/open-chat/identity";
import type { OpenThread, PersonRef } from "@/lib/open-chat/types";

export function ReplyBox({
  thread,
  others,
  live,
  onPracticeReply,
}: {
  thread: OpenThread;
  others: PersonRef[];
  live: boolean;
  onPracticeReply: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [reason, setReason] = useState<string | null>(null);

  function practiceReply() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onPracticeReply(trimmed);
  }

  function markSamePerson() {
    let kind: ReturnType<typeof samePerson> = null;
    for (const other of others) {
      const found = samePerson(thread, other);
      if (found !== null) {
        kind = found;
        break;
      }
    }
    setReason(samePersonReason(kind));
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="field-label">回她</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="寫給這位客人"
          className="field"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          <a className="btn btn-primary" href="/api/chat/open">
            去收件匣回她
          </a>
        ) : (
          <button type="button" className="btn btn-primary" onClick={practiceReply}>
            回她
          </button>
        )}
        <a className="btn btn-secondary" href={`/workspace/erp/sales?party=${encodeURIComponent(thread.name)}`}>
          附報價
        </a>
        <button type="button" className="btn btn-secondary" onClick={markSamePerson}>
          標成同一個人
        </button>
      </div>
      <p className="text-xs text-cream-dim">
        {live ? "真的送出在收件匣。這裡不再送一次。" : "寫在這台電腦，還沒傳到 LINE、IG 或 FB。"}
      </p>
      {reason !== null ? <p role="status">{reason}</p> : null}
    </div>
  );
}
