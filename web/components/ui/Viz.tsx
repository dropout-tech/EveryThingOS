import type { ReactNode } from "react";

const ICONS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  store: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
  cart: "M3 4h2l2.4 11h10.2L20 8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  calendar: "M4 5h16v15H4zM16 3v4M8 3v4M4 10h16",
  users: "M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1.5a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  lock: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  box: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  leaf: "M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z",
  camera: "M4 7h3l2-2h6l2 2h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  thumb: "M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7",
  tablet: "M6 3h12v18H6zM11 18h2",
  web: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.6 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`viz-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export type VizTone = "accent" | "ok" | "warn" | "danger" | "muted" | "soft";

/** Horizontal stacked bar. `marker` draws a thin line at that value (a safety level or a legal cap). */
export function Bar({
  segments,
  max,
  marker,
  label,
  className = "",
}: {
  segments: { value: number; tone: VizTone }[];
  max: number;
  marker?: number;
  label: string;
  className?: string;
}) {
  const total = Math.max(max, segments.reduce((s, x) => s + Math.max(0, x.value), 0), 1);
  return (
    <div className={`viz-bar ${className}`} role="img" aria-label={label}>
      {segments.map((s, i) =>
        s.value > 0 ? <span key={i} className={`viz-seg viz-${s.tone}`} style={{ width: `${(s.value / total) * 100}%` }} /> : null,
      )}
      {marker !== undefined ? <i className="viz-marker" style={{ left: `${Math.min(100, (marker / total) * 100)}%` }} /> : null}
    </div>
  );
}

export function Legend({ items }: { items: { tone: VizTone; label: ReactNode }[] }) {
  return (
    <span className="viz-legend">
      {items.map((it, i) => (
        <span key={i}>
          <i className={`viz-${it.tone}`} />
          {it.label}
        </span>
      ))}
    </span>
  );
}

export function Avatar({ name, tone = "accent" }: { name: string; tone?: "accent" | "warn" | "muted" }) {
  return (
    <span className={`viz-avatar viz-avatar-${tone}`} aria-hidden="true">
      {name.trim().slice(0, 1)}
    </span>
  );
}

export function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`viz-check ${ok ? "viz-check-ok" : "viz-check-no"}`}>
      <Icon name={ok ? "check" : "x"} />
      {children}
    </span>
  );
}

/** One dot per session: filled for attended. */
export function Dots({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <span className="viz-dots" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? "on" : ""} />
      ))}
    </span>
  );
}

export function Stat({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="viz-stat">
      <Icon name={icon} />
      {children}
    </span>
  );
}
