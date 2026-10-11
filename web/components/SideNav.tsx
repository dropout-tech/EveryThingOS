"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { trapTab } from "./ui/ConfirmDialog";

type NavItem = { href: string; label: string };

function isActive(path: string, href: string) {
  if (href === "/workspace") return path === "/workspace";
  if (href === "/workspace/erp/sales") return path === href || path === "/workspace/erp" || path === "/workspace/erp/compare";
  return path === href || path.startsWith(`${href}/`);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 text-sm" aria-label="工作選單">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(path, item.href) ? "page" : undefined}
          className={`nav-link ${item.href === "/workspace/settings" ? "mt-auto" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

const TAB_COUNT = 4;

/** Phones: the first four places stay one tap away; everything else is under 更多. */
export function TabBar({ items, extras }: { items: NavItem[]; extras?: ReactNode }) {
  const path = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const main = items.filter((item) => item.href !== "/workspace/settings").slice(0, TAB_COUNT);
  const rest = items.filter((item) => !main.includes(item));
  const restActive = rest.some((item) => isActive(path, item.href));

  useEffect(() => {
    sheet.current?.close();
  }, [path]);

  return (
    <>
      <nav className="tabbar" aria-label="常用">
        {main.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(path, item.href) ? "page" : undefined} className="tabbar-item">
            <span className="tabbar-dot" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className="tabbar-item"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={restActive ? "page" : undefined}
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
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">全部功能</h2>
            <button type="button" className="btn btn-ghost btn-sm no-underline" onClick={() => sheet.current?.close()}>
              關閉
            </button>
          </div>
          <nav aria-label="全部功能">
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isActive(path, item.href) ? "page" : undefined} className="nav-link glass-chip justify-center">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {extras ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm">{extras}</div> : null}
        </div>
      </dialog>
    </>
  );
}
