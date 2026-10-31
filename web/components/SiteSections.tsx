import Link from "next/link";
import type { ReactNode } from "react";
import { AI_USAGE_NOTE, COMMERCIAL, FAQ, MODULE_STATUS, MODULES, ONBOARDING_FLOW, PRICE_YEAR_TWD, TRUST_LINKS, type ModuleStatus } from "@/lib/commercial";
import { ERP_PARITY, SALES_STEPS } from "@/lib/erp";

const TONE: Record<ModuleStatus, string> = { ready: "ok", setup: "warn", pilot: "muted" };

const SHOTS = [
  { id: "sales", label: "生意：一張單一個按鈕", light: "/shots/sales-white.png", dark: "/shots/sales-black.png" },
  { id: "reports", label: "儀表板：營收、毛利、前十大客人", light: "/shots/reports-white.png", dark: "/shots/reports-black.png" },
  { id: "finance", label: "收錢：帳齡與營業稅", light: "/shots/finance-white.png", dark: "/shots/finance-black.png" },
  { id: "hr", label: "人事：打卡、請假、核准", light: "/shots/hr-white.png", dark: "/shots/hr-black.png" },
] as const;

export function SectionTitle({ title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <h2 className="site-display text-2xl sm:text-3xl">{title}</h2>
      {children ? <p className="mt-2 text-cream-dim">{children}</p> : null}
    </div>
  );
}

export function SiteHero({ demoHref = "/?setup=1", as: Heading = "h1" }: { demoHref?: string; as?: "h1" | "h2" }) {
  return (
    <section className="site-hero" aria-labelledby="hero-title">
      <div className="min-w-0">
        <Heading id="hero-title" className="site-display text-4xl sm:text-6xl">
          一個登入做完
        </Heading>
        <p className="mt-3 text-cream-dim">客人、進銷存、帳、薪資。對齊鼎新 A1／億看。</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={demoHref} className="glass-pill px-5 py-2.5">
            先看示範
          </Link>
        </div>
      </div>
      <p className="site-price min-w-0">
        <span className="site-price-unit">NT$</span>
        <span className="site-price-figure">{PRICE_YEAR_TWD.toLocaleString("zh-TW")}</span>
        <span className="mt-2 block max-w-xs text-sm text-cream-dim">AI 版，一年，含稅。不用 AI，免費。</span>
        <span className="mt-1 block max-w-xs text-xs text-cream-dim">{AI_USAGE_NOTE}</span>
      </p>
    </section>
  );
}

export function TierCompare() {
  return (
    <section aria-label="方案對照" className="site-tiers">
      <div>
        <p className="text-sm text-cream-dim">不用 AI</p>
        <p className="site-price-figure mt-2">NT$0</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["CRM 客人", "進銷存", "財務與稅", "人事薪資", "老闆報表", "100 種產業包", "不限帳號"].map((item) => (
            <span key={item} className="site-chip" data-tone="ok">
              {item}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm text-cream-dim">AI 版（一年，含稅）</p>
        <p className="site-price-figure mt-2">NT${PRICE_YEAR_TWD.toLocaleString("zh-TW")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["包含免費版全部", "右側 AI 代理人", "顧問到現場導入", "現在用量不限", "以後限量會先說"].map((item) => (
            <span key={item} className="site-chip" data-tone="ok">
              {item}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-cream-dim">{AI_USAGE_NOTE}</p>
      </div>
    </section>
  );
}

export function FlowDiagram() {
  return (
    <section aria-label="單據流程" className="space-y-3">
      <div className="site-flow">
        {SALES_STEPS.map((s, i) => (
          <span key={s.id} className="contents">
            {i > 0 ? <span aria-hidden className="site-flow-sep" /> : null}
            <span className="site-flow-step" data-tone={i === SALES_STEPS.length - 1 ? "ok" : undefined}>
              {s.formal}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function ProductShots() {
  return (
    <section aria-labelledby="shots" className="space-y-6">
      <h2 id="shots" className="site-display text-2xl sm:text-3xl">
        實際畫面
      </h2>
      <div className="site-shots">
        {SHOTS.map((shot) => (
          <figure key={shot.id} className="site-shot">
            <img src={shot.light} alt={shot.label} width={1280} height={800} loading="lazy" className="site-shot-light" />
            <img src={shot.dark} alt={shot.label} width={1280} height={800} loading="lazy" className="site-shot-dark" />
            <figcaption className="mt-2 text-sm text-cream-dim">{shot.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function ModuleGrid() {
  return (
    <section className="space-y-4" aria-labelledby="modules">
      <div id="modules">
        <SectionTitle kicker="包含的功能" title="模組狀態" />
      </div>
      <ul className="site-ruled">
        {MODULES.map((m) => (
          <li key={m.id} className="site-row">
            <h3 className="font-medium">{m.name}</h3>
            <p className="min-w-0 text-sm text-cream-dim">
              {m.detail}
              {m.note ? `（${m.note}）` : ""}
            </p>
            <span className="site-chip" data-tone={TONE[m.status]} title={MODULE_STATUS[m.status].hint}>
              {MODULE_STATUS[m.status].label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ParityPreview({ full = false }: { full?: boolean }) {
  const rows = full ? ERP_PARITY : ERP_PARITY.slice(0, 6);
  return (
    <section className="space-y-4" aria-labelledby="compare">
      <div id="compare">
        <SectionTitle kicker="跟現在用的比" title="鼎新 A1、億看對照" />
      </div>
      <div className="site-ruled hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-cream-dim">
            <tr>
              <th scope="col" className="px-4 py-3 font-normal">項目</th>
              <th scope="col" className="px-4 py-3 font-normal">鼎新 A1</th>
              <th scope="col" className="px-4 py-3 font-normal">億看</th>
              <th scope="col" className="px-4 py-3 font-normal text-cream">EveryThingOS</th>
              {full ? <th scope="col" className="px-4 py-3 font-normal">差別</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.capability} className="border-t border-[var(--line)] align-top">
                <th scope="row" className="px-4 py-3 font-normal">{row.capability}</th>
                <td className="px-4 py-3 text-cream-dim">{row.a1}</td>
                <td className="px-4 py-3 text-cream-dim">{row.ecount}</td>
                <td className="px-4 py-3">{row.dropout}</td>
                {full ? <td className="px-4 py-3 text-cream-dim">{row.better}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="site-ruled md:hidden">
        {rows.map((row) => (
          <li key={row.capability} className="py-3 text-sm">
            <p className="font-medium">{row.capability}</p>
            <dl className="mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-cream-dim">鼎新 A1</dt>
              <dd className="text-cream-dim">{row.a1}</dd>
              <dt className="text-cream-dim">億看</dt>
              <dd className="text-cream-dim">{row.ecount}</dd>
              <dt>DropOut</dt>
              <dd>{row.dropout}</dd>
            </dl>
          </li>
        ))}
      </ul>
      {full ? null : (
        <Link href="/saas" className="inline-block text-sm underline underline-offset-4 hover:text-cream">
          全部 {ERP_PARITY.length} 項對照
        </Link>
      )}
    </section>
  );
}

export function OnboardingSteps() {
  return (
    <section className="space-y-4" aria-labelledby="onboarding">
      <div id="onboarding">
        <SectionTitle kicker="怎麼開始" title="導入四步" />
      </div>
      <ol className="site-steps">
        {ONBOARDING_FLOW.map((step) => (
          <li key={step.id}>
            <p className="site-step-no">{step.id}</p>
            <h3 className="mt-2 font-medium">{step.title}</h3>
            <p className="mt-1 text-sm text-cream-dim">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TrustStrip() {
  return (
    <section aria-labelledby="trust" className="space-y-3">
      <h2 id="trust" className="site-display text-xl">
        條款與狀態
      </h2>
      <div className="flex flex-wrap gap-2">
        {TRUST_LINKS.map((t) => (
          <Link key={t.href} href={t.href} className="glass-pill px-4 py-2 text-sm">
            {t.label}
          </Link>
        ))}
      </div>
      <p className="scene-type text-xs">草稿待律師審閱；無 ISO 27001／SOC 2。</p>
    </section>
  );
}

export function FaqList() {
  return (
    <section className="space-y-4" aria-labelledby="faq">
      <div id="faq">
        <SectionTitle kicker="常見問題" title="常見問題" />
      </div>
      <div className="site-ruled">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="text-cream-dim transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 text-sm text-cream-dim">{item.a}</p>
          </details>
        ))}
      </div>
      <p className="scene-type text-sm">
        <a href={`mailto:${COMMERCIAL.email}`} className="underline underline-offset-4 hover:text-cream">
          {COMMERCIAL.email}
        </a>
        <Link href="/consulting#book" className="ml-4 underline underline-offset-4 hover:text-cream">
          約顧問
        </Link>
      </p>
    </section>
  );
}
