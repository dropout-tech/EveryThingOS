"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { HINTS, type HintId } from "@/lib/guide";
import { useGuideFlag } from "@/lib/guide-state";

/**
 * A small dismissible tip for one page. Dismissal is remembered per person in
 * this browser; a quiet 「提示」 button brings it back. Renders nothing until
 * the browser has said whether it was dismissed, so it never flashes.
 */
export function Hint({ id, help, className = "" }: { id: HintId; help?: string; className?: string }) {
  const { title, body } = HINTS[id];
  const dismissed = useGuideFlag(`hint:${id}`);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const [moved, setMoved] = useState<"open" | "closed" | null>(null);

  useEffect(() => {
    if (moved === "open") closeRef.current?.focus();
    if (moved === "closed") reopenRef.current?.focus();
  }, [moved, dismissed.set]);

  if (!dismissed.ready) return null;

  if (dismissed.set) {
    return (
      <button
        ref={reopenRef}
        type="button"
        onClick={() => {
          dismissed.off();
          setMoved("open");
        }}
        className={`glass-well inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs hover:text-cream ${className}`}
        aria-label={`再看一次提示：${title}`}
      >
        <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full border border-current text-[11px]">
          ?
        </span>
        提示
      </button>
    );
  }

  function close() {
    dismissed.on();
    setMoved("closed");
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  return (
    <aside
      role="note"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className={`glass-well relative flex max-w-xl items-start gap-3 p-4 text-sm motion-safe:transition motion-safe:duration-300 starting:translate-y-1 starting:opacity-0 ${className}`}
    >
      <span aria-hidden className="glass-cta mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs">
        ?
      </span>
      <div className="min-w-0 flex-1">
        <p id={titleId} className="font-medium">
          {title}
        </p>
        <p className="mt-1 text-cream-dim">{body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          <button ref={closeRef} type="button" onClick={close} className="glass-pill rounded-full px-3 py-1">
            知道了
          </button>
          {help ? (
            <Link href={`/help/${help}`} className="text-cream-dim underline hover:text-cream">
              看說明
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
