"use client";

import Link from "next/link";
import { useState } from "react";
import { HELP, HELP_CATEGORIES, searchHelp } from "@/lib/help";

export function HelpSearch({ initial = "" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  const hits = searchHelp(query.trim());
  const searching = query.trim().length > 0;

  return (
    <div>
      <form action="/help" role="search" onSubmit={(e) => e.preventDefault()} className="glass-well flex items-center gap-2 rounded-full px-4 py-2">
        <label htmlFor="help-q" className="sr-only">
          搜尋說明
        </label>
        <span aria-hidden className="text-cream-dim">
          ⌕
        </span>
        <input
          id="help-q"
          name="q"
          type="search"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="找找看：匯入客人、收款、電子發票、權限…"
          className="w-full bg-transparent py-1.5 text-cream outline-none placeholder:text-cream-dim"
        />
      </form>
      <p aria-live="polite" className="mt-3 text-sm text-cream-dim">
        {searching ? (hits.length ? `找到 ${hits.length} 篇` : "找不到相關的說明，換個說法試試，或直接問你的導入顧問。") : `共 ${HELP.length} 篇`}
      </p>

      {searching ? (
        <ul className="mt-4 grid gap-3">
          {hits.map((a) => (
            <ArticleCard key={a.slug} slug={a.slug} title={a.title} summary={a.summary} category={a.category} />
          ))}
        </ul>
      ) : (
        HELP_CATEGORIES.map((category) => {
          const items = HELP.filter((a) => a.category === category);
          if (!items.length) return null;
          return (
            <section key={category} className="mt-8" aria-labelledby={`cat-${category}`}>
              <h2 id={`cat-${category}`} className="text-sm text-teal">
                {category}
              </h2>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {items.map((a) => (
                  <ArticleCard key={a.slug} slug={a.slug} title={a.title} summary={a.summary} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function ArticleCard({ slug, title, summary, category }: { slug: string; title: string; summary: string; category?: string }) {
  return (
    <li>
      <Link href={`/help/${slug}`} className="glass-well glass-lift block h-full rounded-2xl px-5 py-4">
        {category ? <span className="text-xs text-teal">{category}</span> : null}
        <span className="block font-medium text-cream">{title}</span>
        <span className="mt-1 block text-sm text-cream-dim">{summary}</span>
      </Link>
    </li>
  );
}
