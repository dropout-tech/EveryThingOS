"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { openPalette } from "./CommandPalette";
import { trapTab } from "./ui/ConfirmDialog";
import { isActive, tabItems, type NavSection } from "@/lib/nav";

export function SideNav({ sections }: { sections: NavSection[] }) {
  const path = usePathname();

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto p-3 text-sm" aria-label="工作選單">
      {sections.map((section) => (
        <div key={section.id} className={`nav-group ${section.id === "settings" ? "mt-auto pt-3" : ""}`}>
          {section.title ? (
            <p className="nav-group-title" id={`nav-${section.id}`}>
              {section.title}
            </p>
          ) : null}
          <ul className="space-y-0.5" aria-labelledby={section.title ? `nav-${section.id}` : undefined}>
            {section.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={isActive(path, item.href) ? "page" : undefined} className="nav-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phones: four places one tap away; the rest, grouped, under 更多. */
export function TabBar({ sections, extras }: { sections: NavSection[]; extras?: ReactNode }) {
  const path = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const tabs = tabItems(sections);
  const inTabs = (href: string) => tabs.some((tab) => (tab.match ? isActive(href, tab.href, tab.match) : tab.href === href));
  const anyTabActive = tabs.some((tab) => isActive(path, tab.href, tab.match));

  useEffect(() => {
    sheet.current?.close();
  }, [path]);

  return (
    <>
      <nav className="tabbar" aria-label="常用">
        {tabs.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(path, item.href, item.match) ? "page" : undefined} className="tabbar-item">
            <span className="tabbar-dot" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className="tabbar-item"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={!anyTabActive ? "page" : undefined}
          onClick={() => {
            sheet.current?.showModal();
            setOpen(true);
          }}
        >
          <span className="tabbar-dot" aria-hidden="true" />
          更多
        </button>
      </nav>
      <dialog
        ref={sheet}
        className="dialog dialog-sheet"
        aria-label="全部功能"
        onClose={() => setOpen(false)}
        onKeyDown={trapTab}
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current?.close();
        }}
      >
        <div className="max-h-[80dvh] space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">全部功能</h2>
            <button type="button" className="btn btn-ghost btn-sm no-underline" onClick={() => sheet.current?.close()}>
              關閉
            </button>
          </div>
          <button
            type="button"
            className="cmdk-trigger w-full"
            onClick={() => {
              sheet.current?.close();
              openPalette();
            }}
          >
            搜尋頁面或要做的事…
          </button>
          <nav aria-label="全部功能" className="space-y-4">
            {sections.map((section) => {
              const items = section.items.filter((item) => section.id !== "today" || !inTabs(item.href));
              if (!items.length) return null;
              return (
                <div key={section.id}>
                  {section.title ? <p className="nav-group-title px-0">{section.title}</p> : null}
                  <ul className="grid grid-cols-2 gap-2">
                    {items.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} aria-current={isActive(path, item.href) ? "page" : undefined} className="nav-link glass-chip justify-center">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          {extras ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm">{extras}</div> : null}
        </div>
      </dialog>
    </>
  );
}
