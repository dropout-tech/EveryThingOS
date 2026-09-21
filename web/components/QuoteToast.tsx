"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nextQuote, quoteForDay, type Quote } from "@/lib/quotes";

const DISMISS_KEY = "dropout:quote-dismissed";

export function QuoteToast() {
  const [quote, setQuote] = useState<Quote>(() => quoteForDay());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  return (
    <>
      {open ? null : (
        <button
          type="button"
          className="quote-fab glass-pill px-3 py-2 text-xs"
          onClick={() => {
            sessionStorage.removeItem(DISMISS_KEY);
            setQuote(quoteForDay());
            setOpen(true);
          }}
        >
          今日一句
        </button>
      )}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="點背景關閉"
            onClick={dismiss}
          />
          <article
            role="dialog"
            aria-labelledby="dropout-quote"
            className="glass glass-quote relative w-full max-w-md px-6 py-7"
          >
            <p className="display text-[11px] tracking-[0.22em] text-cream-dim uppercase">創業一句</p>
            <blockquote id="dropout-quote" className="mt-3 text-2xl leading-snug font-medium">
              {quote.line}
            </blockquote>
            <p className="mt-4 text-sm text-cream-dim">— {quote.by}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/workspace" className="glass-cta rounded-full px-4 py-2 text-sm" onClick={dismiss}>
                去做今天三件事
              </Link>
              <button
                type="button"
                className="glass-pill px-4 py-2 text-sm"
                onClick={() => setQuote((current) => nextQuote(current))}
              >
                換一句
              </button>
              <button type="button" className="glass-pill px-4 py-2 text-sm" onClick={dismiss}>
                關閉
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}
