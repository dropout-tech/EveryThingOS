"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type IndustryChoice = {
  id: string;
  nameZh: string;
  nameEn: string;
  group: string;
  tagline: string;
};

type IndustryPickerProps = {
  options: IndustryChoice[];
  currentId?: string;
  variant?: "hero" | "compact";
};

function matches(item: IndustryChoice, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.nameZh.toLowerCase().includes(q) ||
    item.nameEn.toLowerCase().includes(q) ||
    item.group.toLowerCase().includes(q) ||
    item.tagline.toLowerCase().includes(q)
  );
}

export function IndustryPicker({ options, currentId, variant = "hero" }: IndustryPickerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(variant === "hero");
  const [pending, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = options.find((item) => item.id === currentId);
  const groups = useMemo(() => [...new Set(options.map((item) => item.group))], [options]);

  const grouped = useMemo(() => {
    const filtered = options.filter((item) => matches(item, query));
    const buckets: { group: string; items: IndustryChoice[] }[] = [];
    for (const item of filtered) {
      const last = buckets[buckets.length - 1];
      if (!last || last.group !== item.group) buckets.push({ group: item.group, items: [item] });
      else last.items.push(item);
    }
    return buckets;
  }, [options, query]);

  const shown = grouped.reduce((sum, group) => sum + group.items.length, 0);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (variant !== "compact" || !open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, variant]);

  function pick(id: string) {
    start(async () => {
      await fetch("/api/industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setOpen(false);
      setQuery("");
      if (variant === "hero") router.push("/workspace");
      router.refresh();
    });
  }

  const list = !searching ? (
    <div className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <button
          key={group}
          type="button"
          className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/16"
          onClick={() => {
            setQuery(group);
            inputRef.current?.focus();
          }}
        >
          {group}
        </button>
      ))}
    </div>
  ) : (
    <div className="glass-well max-h-[min(22rem,50vh)] overflow-y-auto p-2">
      {shown === 0 ? (
        <p className="px-3 py-6 text-sm text-cream-dim">沒有這一行。改兩個字再找一次。</p>
      ) : (
        grouped.map((group) => (
          <section key={group.group} className="mb-2">
            <p className="px-3 py-1 text-[11px] tracking-[0.16em] text-cream-dim uppercase">{group.group}</p>
            <ul>
              {group.items.map((item) => {
                const active = item.id === currentId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => pick(item.id)}
                      className={`flex w-full flex-col rounded-2xl px-3 py-2 text-left ${
                        active ? "glass-cta" : "hover:bg-white/10"
                      }`}
                    >
                      <span className="font-medium">{item.nameZh}</span>
                      <span className="text-xs text-cream-dim">{item.tagline}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );

  if (variant === "compact") {
    return (
      <div ref={rootRef} className="relative min-w-0">
        <button
          type="button"
          className="glass-chip max-w-[16rem] truncate px-3 py-1.5 text-left text-xs"
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
            window.setTimeout(() => inputRef.current?.focus(), 30);
          }}
        >
          {current ? current.nameZh : "選你做哪一行"}
        </button>
        {open ? (
          <div className="glass absolute right-0 z-[70] mt-2 w-[min(22rem,calc(100vw-2rem))] p-3">
            <p className="text-[11px] text-cream-dim">換一行，今天要做的事會跟著變。</p>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋：服飾、教室、診所…"
              className="glass-well mt-2 w-full rounded-2xl px-3 py-2 text-sm text-cream outline-none"
              autoComplete="off"
            />
            <div className="mt-3">{list}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div id="industry" className="space-y-3">
      <label className="block">
        <span className="text-sm text-cream-dim">你做哪一行？先點分類，或直接打兩個字。</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例如：服飾、桌球、牙醫、民宿"
          className="glass-well mt-2 w-full rounded-2xl px-4 py-3 text-base text-cream outline-none"
          autoComplete="off"
        />
      </label>
      {list}
      {pending ? <p className="text-xs text-cream-dim">正在換成這一行…</p> : null}
    </div>
  );
}
