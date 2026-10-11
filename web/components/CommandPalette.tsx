"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { PALETTE_ACTIONS, type NavSection } from "@/lib/nav";
import { STYLES, syncThemeColor } from "@/lib/style";

type Entry = { id: string; group: string; label: string; hint?: string; keywords: string; href?: string; look?: { style?: string; theme?: string } };

const OPEN_EVENT = "dropout:palette";
const noop = () => () => {};

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 4 4" strokeLinecap="round" />
    </svg>
  );
}

export function PaletteTrigger({ className = "" }: { className?: string }) {
  const mac = useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  return (
    <button type="button" className={`cmdk-trigger ${className}`} onClick={openPalette} aria-keyshortcuts="Meta+K Control+K">
      <span className="size-4">
        <SearchIcon />
      </span>
      <span>搜尋</span>
      <span className="kbd hidden md:inline-flex" aria-hidden="true">
        {mac ? "⌘K" : "Ctrl K"}
      </span>
    </button>
  );
}

/** ⌘K／Ctrl+K: jump to any page or start a common task from anywhere in the workspace. */
export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const close = useCallback(() => ref.current?.close(), []);

  const entries = useMemo<Entry[]>(() => {
    const allowed = sections.flatMap((section) => section.items.map((item) => item.href));
    const pages = sections.flatMap((section) =>
      section.items.map((item) => ({
        id: `page:${item.href}`,
        group: "頁面",
        label: item.label,
        hint: section.title,
        keywords: `${item.label} ${section.title ?? ""}`,
        href: item.href,
      })),
    );
    const actions = PALETTE_ACTIONS.filter((action) => !action.needs || allowed.includes(action.needs)).map((action) => ({
      id: `do:${action.href}`,
      group: "要做的事",
      label: action.label,
      keywords: `${action.label} ${action.keywords}`,
      href: action.href,
    }));
    const appearance: Entry[] = [
      ...STYLES.map((style) => ({ id: `style:${style.id}`, group: "外觀", label: `換成「${style.name}」`, hint: style.note, keywords: `風格 外觀 ${style.name}`, look: { style: style.id } })),
      { id: "theme:black", group: "外觀", label: "深色", keywords: "深色 黑 dark 主題", look: { theme: "black" } },
      { id: "theme:white", group: "外觀", label: "淺色", keywords: "淺色 白 light 主題", look: { theme: "white" } },
    ];
    return [...actions, ...pages, ...appearance];
  }, [sections]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return entries.filter((entry) => entry.group !== "外觀");
    return entries.filter((entry) => words.every((word) => entry.keywords.toLowerCase().includes(word)));
  }, [entries, query]);

  async function run(entry: Entry | undefined) {
    if (!entry) return;
    close();
    if (entry.href) {
      router.push(entry.href);
      return;
    }
    if (!entry.look) return;
    if (entry.look.style) document.documentElement.dataset.style = entry.look.style;
    if (entry.look.theme) document.documentElement.dataset.theme = entry.look.theme;
    syncThemeColor();
    await fetch("/api/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry.look) });
    router.refresh();
  }

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (ref.current?.open) close();
        else open();
      }
    }
    function open() {
      setQuery("");
      setActive(0);
      ref.current?.showModal();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, [close]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function onPick(event: MouseEvent<HTMLElement>) {
    const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (option) void run(results[Number(option.dataset.index)]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === "Home") {
      setActive(0);
    } else if (event.key === "End") {
      setActive(Math.max(results.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      void run(results[active]);
    }
  }

  const groups = [...new Set(results.map((entry) => entry.group))];

  return (
    <dialog
      ref={ref}
      className="cmdk"
      aria-label="搜尋頁面與要做的事"
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-cream-dim">
          <SearchIcon />
        </span>
        <input
          ref={input}
          className="cmdk-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label="要找什麼"
          placeholder="找頁面或要做的事，例如「報價」「請假」"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="cmdk-list" id={listId} role="listbox" aria-label="結果" onClick={onPick}>
        {results.length ? (
          groups.map((group) => (
            <div key={group} role="group" aria-labelledby={`${listId}-${group}`}>
              <p id={`${listId}-${group}`} className="cmdk-group-title" role="presentation">
                {group}
              </p>
              {results.map((entry, index) =>
                entry.group === group ? (
                  <div
                    key={entry.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className="cmdk-item"
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                  >
                    <span>{entry.label}</span>
                    {entry.hint ? <span className="cmdk-item-hint">{entry.hint}</span> : null}
                  </div>
                ) : null,
              )}
            </div>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-sm text-cream-dim" role="status">
            找不到「{query}」。換個說法，例如「收款」「客人」。
          </p>
        )}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] px-4 py-2 text-xs text-cream-dim" aria-hidden="true">
        <span>
          <span className="kbd">↑</span> <span className="kbd">↓</span> 選
        </span>
        <span>
          <span className="kbd">Enter</span> 打開
        </span>
        <span>
          <span className="kbd">Esc</span> 關閉
        </span>
      </p>
    </dialog>
  );
}
