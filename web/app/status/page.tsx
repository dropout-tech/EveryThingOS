import { connection } from "next/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import Link from "next/link";
import { COMMERCIAL } from "@/lib/commercial";
import { SLA } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";
import { platformStatus, type Level, type StatusIncident, type StatusTarget } from "@/lib/status";

export const metadata = pageMeta("/status", "系統狀態", "EveryThingOS 現在是否正常：畫面、系統同步、ERPNext，近 30 天可用率與近 14 天事故。每 5 分鐘檢查一次。");

const LEVEL: Record<Level, { label: string; tone: string }> = {
  up: { label: "正常", tone: "ok" },
  degraded: { label: "部分受影響", tone: "warn" },
  down: { label: "連不上", tone: "bad" },
  unknown: { label: "還沒有資料", tone: "muted" },
};

const BANNER: Record<Level, string> = { up: "✓", degraded: "!", down: "✕", unknown: "?" };

const OVERALL: Record<Level, string> = {
  up: "全部正常",
  degraded: "部分服務受影響",
  down: "服務中斷，正在處理",
  unknown: "還沒有監看資料",
};

const TARGET: Record<StatusTarget, string> = { erpnext: "ERPNext（單據與帳）", shell: "EveryThingOS 畫面" };

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
        {note ? <p className="text-sm text-cream-dim">{note}</p> : null}
      </div>
      <span className="site-chip" data-tone={l.tone}>
        {l.label}
      </span>
    </li>
  );
}

function Availability({ label, value }: { label: string; value?: number | null }) {
  const below = typeof value === "number" && value < Number.parseFloat(SLA.uptime);
  return (
    <div>
      <p className="text-sm text-cream-dim">{label}</p>
      <p className={`mt-1 text-3xl font-medium ${below ? "site-error" : ""}`}>{pct(value)}</p>
    </div>
  );
}

function Incidents({ list, empty }: { list: StatusIncident[]; empty: string }) {
  if (!list.length) return <p className="text-sm text-cream-dim">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--line)] text-sm">
      {list.map((inc) => (
        <li key={`${inc.target}-${inc.started_at}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{TARGET[inc.target]} 連不上</span>
          <span className="flex items-center gap-2 text-cream-dim">
            {taipei(inc.started_at)} 起
            <span className="site-chip" data-tone={inc.resolved_at ? "muted" : "bad"}>
              {inc.resolved_at ? `已恢復・${duration(inc)}` : "處理中"}
            </span>
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
      <main id="main" className="site-scope mx-auto max-w-3xl space-y-6 px-5 py-10 sm:py-14">
        <section className="site-sheet p-6 sm:p-10" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-cream-dim">系統狀態</p>
            {origin === "demo" ? (
              <span className="site-chip" data-tone="warn">
                示範資料
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <span className="site-chip site-chip-icon !px-0 !text-2xl !leading-none" data-tone={LEVEL[data.status].tone} aria-hidden>
              <span className="grid size-12 place-items-center">{BANNER[data.status]}</span>
            </span>
            <h1 className="text-3xl font-medium sm:text-4xl">{OVERALL[data.status]}</h1>
          </div>
          <p className="mt-4 text-sm text-cream-dim">
            {origin === "demo"
              ? "這是示範資料。接上監看後，這裡顯示真的檢查結果。"
              : origin === "error"
                ? `${message}。這一頁打得開，代表 EveryThingOS 畫面正常；其他部分等狀態服務回來再看。`
                : `每 5 分鐘檢查一次${data.checked_at ? `，最後檢查 ${taipei(data.checked_at)}（台灣時間）` : ""}。`}
          </p>
        </section>

        <section className="site-sheet p-6 sm:p-8" aria-labelledby="components">
          <h2 id="components" className="text-lg font-medium">
            各部分
          </h2>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            <Row name="EveryThingOS 畫面" note="登入、今天、生意、客人等頁面" level={data.components.shell} />
            <Row name="系統同步" note="LINE／官網表單進客人、金流通知、電子發票、會議紀錄" level={data.components.glue} />
            <Row name="ERPNext" note="所有公司的單據與帳" level={data.components.erpnext} />
          </ul>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--line)] pt-5">
            <Availability label="ERPNext 近 30 天" value={data.availability_30d.erpnext} />
            <Availability label="畫面近 30 天" value={data.availability_30d.shell} />
          </div>
          <p className="mt-3 text-xs text-cream-dim">
            目標每月 {SLA.uptime}，沒做到依
            <Link href="/sla" className="mx-1 underline underline-offset-4 hover:text-cream">
              服務水準
            </Link>
            補償。
          </p>
        </section>

        {site ? (
          <section className="site-sheet p-6 sm:p-8" aria-labelledby="site-status">
            <h2 id="site-status" className="text-lg font-medium">
              這個網址的公司
            </h2>
            <ul className="mt-2 divide-y divide-[var(--line)]">
              <Row name="EveryThingOS 畫面" level={site.components.shell} />
              <Row name="ERPNext" level={site.components.erpnext} />
            </ul>
            <p className="mt-4 text-sm text-cream-dim">
              近 30 天可用率：ERPNext {pct(site.availability_30d.erpnext)}、畫面 {pct(site.availability_30d.shell)}。
            </p>
            <h3 className="mt-6 text-sm text-cream-dim">近 14 天</h3>
            <Incidents list={site.incidents} empty="近 14 天沒有中斷。" />
          </section>
        ) : null}

        <section className="site-sheet space-y-3 p-6 sm:p-8" aria-labelledby="incidents">
          <h2 id="incidents" className="text-lg font-medium">
            近 14 天的事故
          </h2>
          <Incidents list={data.incidents} empty="近 14 天沒有事故。" />
        </section>

        <section className="site-sheet space-y-2 p-6 text-sm text-cream-dim sm:p-8">
          <p>「連不上」的定義：連續兩次檢查（10 分鐘內）都沒有回應。只影響部分公司時顯示「部分受影響」。</p>
          <p>
            遇到問題請寫信到{" "}
            <a href={`mailto:${COMMERCIAL.email}?subject=${encodeURIComponent("EveryThingOS 服務問題")}`} className="underline underline-offset-4 hover:text-cream">
              {COMMERCIAL.email}
            </a>
            ，{SLA.hours}回覆；嚴重事故 {SLA.severeResponse}內回應。也可以先看
            <Link href="/help" className="mx-1 underline underline-offset-4 hover:text-cream">
              說明中心
            </Link>
            。
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
