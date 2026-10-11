import type { ReactNode } from "react";

export type BadgeTone = "demo" | "practice" | "readonly" | "ok" | "warn" | "danger" | "neutral";

const DEFAULT_LABEL: Partial<Record<BadgeTone, string>> = {
  demo: "示範資料",
  practice: "練習",
  readonly: "只能看",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children?: ReactNode; className?: string }) {
  return <span className={`badge ${tone === "neutral" ? "" : `badge-${tone}`} ${className}`}>{children ?? DEFAULT_LABEL[tone]}</span>;
}
