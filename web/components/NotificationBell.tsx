"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Drawer } from "./ui/Drawer";
import { useGuideValue } from "@/lib/guide-state";
import { timeAgo, type NotificationItem, type Notifications } from "@/lib/notifications";

const POLL_MS = 120_000;
const KEEP_READ = 200;

function BellIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5M10 19.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

/** 通知: ERPNext's own notifications for this person, plus what automations did and syncs that got stuck. */
export function NotificationBell() {
  const [data, setData] = useState<Notifications | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [serverRead, setServerRead] = useState<Set<string>>(new Set());
  const stored = useGuideValue("notifications-read");
  const localRead = useMemo(() => {
    try {
      return new Set<string>(stored.value ? (JSON.parse(stored.value) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, [stored.value]);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) return setData({ demo: false, items: [], problems: [] });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Notifications);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const isRead = (item: NotificationItem) => item.read || serverRead.has(item.id) || localRead.has(item.id);
  const items = data?.items ?? [];
  const unread = items.filter((i) => !isRead(i)).length;

  function rememberLocal(ids: string[]) {
    const next = [...new Set([...ids, ...localRead])].slice(0, KEEP_READ);
    stored.set(JSON.stringify(next));
  }

  function markRead(item: NotificationItem) {
    if (isRead(item)) return;
    if (item.source === "erpnext" && !data?.demo) {
      setServerRead((s) => new Set(s).add(item.id));
      fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: item.id.replace(/^erp:/, "") }) }).catch(() => undefined);
    } else {
      rememberLocal([item.id]);
    }
  }

  function markAll() {
    const pending = items.filter((i) => !isRead(i));
    const erp = pending.filter((i) => i.source === "erpnext" && !data?.demo);
    if (erp.length) {
      setServerRead((s) => new Set([...s, ...erp.map((i) => i.id)]));
      fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
    }
    rememberLocal(pending.filter((i) => !erp.includes(i)).map((i) => i.id));
  }

  const label = unread ? `通知，${unread} 則未讀` : "通知";

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm notify-bell"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        <BellIcon />
        <span className="sr-only md:not-sr-only">通知</span>
        {unread ? (
          <span className="badge-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <Drawer
        open={open}
        title="通知"
        onClose={() => setOpen(false)}
        footer={
          unread ? (
            <Button variant="secondary" size="sm" onClick={markAll}>
              全部標為已讀
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {data?.demo ? (
            <p className="flex items-center gap-2 text-xs text-cream-dim">
              <Badge tone="demo" />
              接上 ERPNext 後，這裡是指派給你、提到你的事，和自動化做了什麼。
            </p>
          ) : null}
          {failed && !data ? <p className="text-sm text-warn">暫時讀不到通知，等一下再打開看看。</p> : null}
          {data?.problems.length ? (
            <p className="text-sm text-warn" role="status">
              {data.problems.join("、")} 的通知暫時讀不到，下面可能不完整。
            </p>
          ) : null}
          {!data && !failed ? (
            <p className="text-sm text-cream-dim" aria-busy="true">
              正在讀通知…
            </p>
          ) : null}
          {data && !items.length ? <p className="text-sm text-cream-dim">沒有新的通知。有人指派工作給你、自動化幫你追了什麼，都會出現在這裡。</p> : null}
          {items.length ? (
            <ul className="notify-list">
              {items.map((item) => {
                const read = isRead(item);
                const external = item.href ? /^https?:/.test(item.href) : false;
                const body = (
                  <>
                    <span className="flex items-start justify-between gap-3">
                      <span className={`min-w-0 break-words ${read ? "text-cream-dim" : "font-medium"}`}>
                        {read ? null : <span className="sr-only">未讀：</span>}
                        {item.title}
                      </span>
                      {read ? null : (
                        <span className="notify-dot" aria-hidden="true" />
                      )}
                    </span>
                    {item.detail ? <span className={`block text-xs break-words ${item.tone === "danger" ? "text-danger" : item.tone === "warn" ? "text-warn" : "text-cream-dim"}`}>{item.detail}</span> : null}
                    <span className="block text-xs text-cream-dim">{timeAgo(item.at)}</span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      external ? (
                        <a href={item.href} target="_blank" rel="noreferrer" className="notify-item" onClick={() => markRead(item)}>
                          {body}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="notify-item"
                          onClick={() => {
                            markRead(item);
                            setOpen(false);
                          }}
                        >
                          {body}
                        </Link>
                      )
                    ) : (
                      <button type="button" className="notify-item w-full text-left" onClick={() => markRead(item)}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
