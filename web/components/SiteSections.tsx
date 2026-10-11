import Link from "next/link";
import type { ReactNode } from "react";
import { COMMERCIAL, FAQ, MODULE_STATUS, MODULES, ONBOARDING_FLOW, PRICE_YEAR_TWD, TRUST_LINKS, type ModuleStatus } from "@/lib/commercial";
import { ERP_PARITY } from "@/lib/erp";
import { formatTwd } from "@/lib/format";

const TONE: Record<ModuleStatus, string> = { ready: "ok", setup: "warn", pilot: "muted" };

export function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="site-sheet inline-block max-w-2xl !rounded-3xl px-5 py-4 sm:px-6">
      <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">{kicker}</p>
      <h2 className="mt-2 text-2xl font-medium sm:text-3xl">{title}</h2>
      {children ? <p className="mt-3 text-cream-dim">{children}</p> : null}
    </div>
  );
}

export function SiteHero({ demoHref = "/start", as: Heading = "h1" }: { demoHref?: string; as?: "h1" | "h2" }) {
  return (
    <section className="site-sheet p-6 sm:p-10" aria-labelledby="hero-title">
      <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">台灣中小企業的作業系統</p>
      <Heading id="hero-title" className="mt-3 text-2xl leading-tight font-medium sm:text-5xl">
        客人、進銷存、帳、薪資，
        <br />
        一個登入做完。
      </Heading>
      <p className="mt-4 max-w-2xl text-cream-dim sm:text-lg">
        {COMMERCIAL.audience}進銷存與帳對齊鼎新 A1／億看，畫面只問「下一步是什麼」。
      </p>
      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="num text-3xl font-medium sm:text-4xl">{formatTwd(PRICE_YEAR_TWD)}</p>
        <p className="text-cream-dim">一年・未稅・一間公司・不限帳號・含顧問到現場導入</p>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/consulting#book" className="glass-cta rounded-full px-6 py-3 font-medium">
          約免費導入
        </Link>
        <Link href={demoHref} className="glass-pill px-6 py-3">
          先看示範
        </Link>
        <span className="text-sm text-cream-dim">示範不用登入，資料只留在你的瀏覽器。</span>
      </div>
    </section>
  );
}

export function ModuleGrid() {
  return (
    <section className="space-y-6" aria-labelledby="modules">
      <div id="modules">
        <SectionTitle kicker="包含的功能" title="一年費用裡就有這些，不另外加購">
          狀態照實寫：「導入時接上」是要先有你們自己的外部帳號，「試行」是可以用、但先跟顧問確認合不合適。
        </SectionTitle>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <li key={m.id} className="site-sheet flex flex-col gap-2 p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-medium">{m.name}</h3>
              <span className="site-chip" data-tone={TONE[m.status]} title={MODULE_STATUS[m.status].hint}>
                {MODULE_STATUS[m.status].label}
              </span>
            </div>
            <p className="text-sm text-cream-dim">{m.detail}</p>
            {m.note ? <p className="mt-auto pt-1 text-xs text-cream-dim">＊{m.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ParityPreview({ full = false }: { full?: boolean }) {
  const rows = full ? ERP_PARITY : ERP_PARITY.slice(0, 5);
  return (
    <section className="space-y-6" aria-labelledby="compare">
      <div id="compare">
        <SectionTitle kicker="跟現在用的比" title="鼎新 A1、億看做得到的，這裡也做得到">
          差別在畫面：用現場的話、這個行業用不到的欄位先藏起來，再加上它們沒有的對話與客人。
        </SectionTitle>
      </div>
      <div className="site-sheet hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-cream-dim">
            <tr>
              <th scope="col" className="px-5 py-3 font-normal">要做的事</th>
              <th scope="col" className="px-5 py-3 font-normal">鼎新 A1</th>
              <th scope="col" className="px-5 py-3 font-normal">億看</th>
              <th scope="col" className="px-5 py-3 font-normal text-cream">DropOut OS</th>
              {full ? <th scope="col" className="px-5 py-3 font-normal">為什麼更好用</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.capability} className="border-t border-[var(--line)] align-top">
                <th scope="row" className="px-5 py-3 font-normal">{row.capability}</th>
                <td className="px-5 py-3 text-cream-dim">{row.a1}</td>
                <td className="px-5 py-3 text-cream-dim">{row.ecount}</td>
                <td className="px-5 py-3">{row.dropout}</td>
                {full ? <td className="px-5 py-3 text-cream-dim">{row.better}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.capability} className="site-sheet p-4 text-sm">
            <p className="font-medium">{row.capability}</p>
            <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-cream-dim">鼎新 A1</dt>
              <dd className="text-cream-dim">{row.a1}</dd>
              <dt className="text-cream-dim">億看</dt>
              <dd className="text-cream-dim">{row.ecount}</dd>
              <dt>DropOut</dt>
              <dd>{row.dropout}</dd>
              {full ? (
                <>
                  <dt className="text-cream-dim">差在哪</dt>
                  <dd className="text-cream-dim">{row.better}</dd>
                </>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
      {full ? null : (
        <Link href="/saas" className="scene-type inline-block text-sm underline underline-offset-4 hover:text-cream">
          看完整對照（{ERP_PARITY.length} 項）與可以停掉的訂閱
        </Link>
      )}
    </section>
  );
}

export function OnboardingSteps() {
  return (
    <section className="space-y-6" aria-labelledby="onboarding">
      <div id="onboarding">
        <SectionTitle kicker="怎麼開始" title="四步，顧問陪你們走完">
          導入含在年費裡，不另外開「導入專案」的帳單。
        </SectionTitle>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ONBOARDING_FLOW.map((step) => (
          <li key={step.id} className="site-sheet p-5">
            <p className="display text-sm text-cream-dim">步驟 {step.id}</p>
            <h3 className="mt-1 text-lg font-medium">{step.title}</h3>
            <p className="mt-2 text-sm text-cream-dim">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TrustStrip() {
  return (
    <section aria-labelledby="trust" className="space-y-4">
      <h2 id="trust" className="site-sheet inline-block !rounded-2xl px-4 py-2 text-lg font-medium">
        簽約前可以先看的文件
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_LINKS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="site-sheet link-card block h-full p-4">
              <span className="font-medium">{t.label} →</span>
              <span className="mt-1 block text-sm text-cream-dim">{t.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="scene-type text-xs">條款與政策目前是草稿版本，簽約前會由律師審閱定稿。目前沒有 ISO 27001、SOC 2 等第三方認證，細節寫在資安說明。</p>
    </section>
  );
}

export function FaqList() {
  return (
    <section className="space-y-6" aria-labelledby="faq">
      <div id="faq">
        <SectionTitle kicker="常見問題" title="買之前大家會問的" />
      </div>
      <div className="site-sheet divide-y divide-[var(--line)]">
        {FAQ.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="text-cream-dim transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-cream-dim">{item.a}</p>
          </details>
        ))}
      </div>
      <p className="scene-type text-sm">
        沒看到你的問題？寫信到{" "}
        <a href={`mailto:${COMMERCIAL.email}`} className="underline underline-offset-4 hover:text-cream">
          {COMMERCIAL.email}
        </a>{" "}
        或直接
        <Link href="/consulting#book" className="mx-1 underline underline-offset-4 hover:text-cream">
          約顧問
        </Link>
        。
      </p>
    </section>
  );
}
