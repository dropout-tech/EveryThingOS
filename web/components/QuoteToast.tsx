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
    const timer = window.setTimeout(() => setOpen(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  if (!open) {
    return (
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
    );
  }

  return (
    <article
      role="dialog"
      aria-labelledby="dropout-quote"
      className="quote-fab glass glass-hero glass-quote w-[min(22rem,calc(100%-2rem))] px-5 py-5"
    >
      <p className="display text-[11px] tracking-[0.22em] text-cream-dim uppercase">創業一句</p>
      <blockquote id="dropout-quote" className="mt-2 text-xl leading-snug font-medium">
        {quote.line}
      </blockquote>
      <p className="mt-3 text-sm text-cream-dim">— {quote.by}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/workspace" className="glass-cta rounded-full px-3 py-1.5 text-xs" onClick={dismiss}>
          去做今天這件
        </Link>
        <button type="button" className="glass-pill px-3 py-1.5 text-xs" onClick={() => setQuote((current) => nextQuote(current))}>
          換一句
        </button>
        <button type="button" className="glass-pill px-3 py-1.5 text-xs" onClick={dismiss}>
          關閉
        </button>
      </div>
    </article>
  );
}
