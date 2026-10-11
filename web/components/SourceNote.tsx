import Link from "next/link";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import type { Sourced } from "@/lib/sources/types";

const SYSTEM_LABEL = { erpnext: "ERPNext", glue: "系統同步", chatwoot: "Chatwoot" } as const;

const DENIED_LABEL: Record<string, string> = {
  month_sales: "本月銷貨",
  month_cost: "本月進貨",
  ar: "應收",
  ap: "應付",
  overdue_ar: "逾期應收",
  vat_payable: "營業稅",
  cash: "現金與銀行",
  stock: "庫存",
  ar_aging: "帳齡",
  journals: "傳票",
  einvoices: "電子發票",
  Quotation: "報價",
  "Sales Order": "訂單",
  "Sales Invoice": "銷項發票",
  "Purchase Order": "採購單",
  "Purchase Invoice": "進項發票",
  groups: "名單",
  consent: "同意紀錄",
  newsletters: "電子報",
  last_30_days: "開信與退訂",
  items: "官網商品",
  published: "上架數",
  orders: "網路訂單",
  form_leads: "表單名單",
  bounced: "退信",
  pending: "等確認信",
  on_leave: "今天誰請假",
  approvals: "待核准假單",
  payroll: "薪資",
};

/** Says where the numbers on this page come from. Demo data is always labelled. */
export function SourceNote({ source, demoText = "示範資料。導入後換成你們的客人與帳。" }: { source: Sourced<unknown>; demoText?: string }) {
  if (source.origin === "demo")
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-cream-dim">
        <Badge tone={demoText.startsWith("練習") ? "practice" : "demo"} />
        {demoText.replace(/^(示範資料|示範|練習)。/, "")}
      </p>
    );
  if (source.origin === "error") return null;
  const denied = source.denied?.map((key) => DENIED_LABEL[key] ?? key) ?? [];
  return (
    <p className="text-xs text-cream-dim">
      來自 {SYSTEM_LABEL[source.system]}
      {source.deskUrl ? (
        <>
          {" · "}
          <a href={source.deskUrl + "/app"} className="underline hover:text-cream" target="_blank" rel="noreferrer">
            打開後台
          </a>
        </>
      ) : null}
      {denied.length ? `。你的角色看不到：${denied.join("、")}` : null}
    </p>
  );
}

/** Shown instead of the page when a connected system fails. Never falls back to demo data. */
export function SourceFailure({ source, next = "/workspace" }: { source: Extract<Sourced<unknown>, { origin: "error" }>; next?: string }) {
  return (
    <section className="glass glass-hero space-y-3 p-6 md:p-8" role="alert">
      <p className="display text-[11px] tracking-[0.2em] text-cream-dim uppercase">{SYSTEM_LABEL[source.system]}</p>
      <h2 className="text-2xl font-medium">{source.kind === "login" ? "要先登入" : "現在拿不到資料"}</h2>
      <p className="text-sm text-cream-dim">{source.message}</p>
      {source.kind === "login" ? (
        <a href={`/api/auth/login?next=${encodeURIComponent(next)}`} className={buttonClass({ variant: "primary" })}>
          用 ERPNext 帳號登入
        </a>
      ) : (
        <p className="text-sm text-cream-dim">
          畫面不會改用示範資料，免得把假數字當真。稍後再整理一次，或到{" "}
          <Link href="/workspace/settings#sync" className="underline hover:text-cream">
            設定
          </Link>{" "}
          看連線狀態。
        </p>
      )}
    </section>
  );
}
