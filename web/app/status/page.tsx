import { connection } from "next/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { COMMERCIAL } from "@/lib/commercial";
import { platformStatus, type Level, type StatusIncident, type StatusTarget } from "@/lib/status";

export const metadata = { title: "服務狀態" };

const LEVEL: Record<Level, { label: string; className: string }> = {
  up: { label: "正常", className: "text-teal" },
  degraded: { label: "部分受影響", className: "text-gold" },
  down: { label: "連不上", className: "text-orange" },
  unknown: { label: "還沒有資料", className: "text-cream-dim" },
};

const OVERALL: Record<Level, string> = {
  up: "全部正常",
  degraded: "部分服務受影響",
  down: "服務中斷，正在處理",
  unknown: "還沒有監看資料",
};

const TARGET: Record<StatusTarget, string> = { erpnext: "ERPNext（單據與帳）", shell: "DropOut OS 畫面" };

const taipei = (iso: string) =>
  new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function duration(inc: StatusIncident) {
  if (!inc.resolved_at) return "處理中";
  const min = Math.max(1, Math.round((Date.parse(inc.resolved_at) - Date.parse(inc.started_at)) / 60_000));
  return min < 60 ? `約 ${min} 分鐘` : `約 ${Math.round(min / 6) / 10} 小時`;
}

const pct = (v?: number | null) => (typeof v === "number" ? `${v.toFixed(2)}%` : "—");

function Row({ name, note, level }: { name: string; note?: string; level: Level }) {
  const l = LEVEL[level];
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div>
        <p>{name}</p>
        {note ? <p className="text-xs text-cream-dim">{note}</p> : null}
      </div>
      <span className={`text-sm ${l.className}`}>{l.label}</span>
    </li>
  );
}

function Incidents({ list, empty }: { list: StatusIncident[]; empty: string }) {
  if (!list.length) return <p className="text-sm text-cream-dim">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--line)] text-sm">
      {list.map((inc) => (
        <li key={`${inc.target}-${inc.started_at}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{TARGET[inc.target]} 連不上</span>
          <span className="text-cream-dim">
            {taipei(inc.started_at)} 起 · <span className={inc.resolved_at ? "" : "text-orange"}>{duration(inc)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function StatusPage() {
  await connection();
  const { origin, data, message } = await platformStatus();
  const site = data.site;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-teal uppercase">服務狀態</p>
        <h1 className={`mt-3 text-4xl font-medium ${data.status === "up" ? "" : LEVEL[data.status].className}`}>{OVERALL[data.status]}</h1>
        <p className="mt-4 text-sm text-cream-dim">
          {origin === "demo"
            ? "示範資料。接上監看後這裡顯示真的檢查結果。"
            : origin === "error"
              ? `${message}。畫面本身打得開，代表 DropOut OS 畫面正常；其他部分等狀態服務回來再看。`
              : `每 5 分鐘檢查一次${data.checked_at ? `，最後檢查 ${taipei(data.checked_at)}` : ""}。`}
        </p>

        <section className="glass glass-hero mt-10 p-6 md:p-8">
          <h2 className="text-lg">整個平台</h2>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            <Row name="DropOut OS 畫面" note="登入、今天、生意、客人等頁面" level={data.components.shell} />
            <Row name="系統同步" note="LINE／官網表單進客人、金流通知、電子發票、會議紀錄" level={data.components.glue} />
            <Row name="ERPNext" note="所有公司的單據與帳" level={data.components.erpnext} />
          </ul>
          <p className="mt-4 text-xs text-cream-dim">
            近 30 天可用率：ERPNext {pct(data.availability_30d.erpnext)}、畫面 {pct(data.availability_30d.shell)}。目標每月 99.5%。
          </p>
        </section>

        {site ? (
          <section className="glass mt-6 p-6 md:p-8">
            <h2 className="text-lg">這個網址的公司</h2>
            <ul className="mt-2 divide-y divide-[var(--line)]">
              <Row name="DropOut OS 畫面" level={site.components.shell} />
              <Row name="ERPNext" level={site.components.erpnext} />
            </ul>
            <p className="mt-4 text-xs text-cream-dim">
              近 30 天可用率：ERPNext {pct(site.availability_30d.erpnext)}、畫面 {pct(site.availability_30d.shell)}。
            </p>
            <h3 className="mt-6 text-sm text-cream-dim">近 14 天</h3>
            <Incidents list={site.incidents} empty="近 14 天沒有中斷。" />
          </section>
        ) : null}

        <section className="mt-10 space-y-3">
          <h2 className="text-lg">近 14 天的事故</h2>
          <Incidents list={data.incidents} empty="近 14 天沒有事故。" />
        </section>

        <section className="mt-12 space-y-2 text-sm text-cream-dim">
          <p>連不上的定義：連續兩次檢查（10 分鐘內）都沒有回應。只影響部分公司時顯示「部分受影響」。</p>
          <p>
            遇到問題請寫信到{" "}
            <a href={`mailto:${COMMERCIAL.email}?subject=${encodeURIComponent("DropOut OS 服務問題")}`} className="text-teal hover:underline">
              {COMMERCIAL.email}
            </a>
            ，週一至週五 09:00–18:00 回覆；嚴重事故 2 小時內回應。
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
