import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PRICE_LABEL, PRICE_NOTE, PRICE_YEAR_TWD } from "@/lib/commercial";
import { listIndustries } from "@/lib/industries";

export const metadata = { title: "一年十萬" };

export default function PricingPage() {
  const n = listIndustries().length;
  const formatted = PRICE_YEAR_TWD.toLocaleString("zh-TW");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-orange uppercase">Pricing</p>
        <h1 className="mt-3 text-4xl font-medium">{PRICE_LABEL}</h1>
        <p className="mt-4 text-cream-dim">{PRICE_NOTE}</p>
        <article className="mt-10 rounded-3xl border border-teal/40 bg-ink-2 p-8">
          <p className="text-sm text-teal">DropOut OS 年約</p>
          <p className="mt-2 text-5xl font-medium">NT${formatted}</p>
          <p className="mt-2 text-cream-dim">一年 · 未稅 · 一間公司一個站</p>
          <ul className="mt-6 space-y-3 text-cream-dim">
            <li>CRM、ERP、魅力圈、清庫、短網址、官網全開</li>
            <li>{n} 個產業包，流程與 Dashboard 可改</li>
            <li>免費顧問導入：選定產業包、主檔、跑通一筆真實生意</li>
            <li>不收每人帳號費、不收模組加購</li>
            <li>全畫面套琢奧識別</li>
          </ul>
          <Link
            href="/consulting"
            className="mt-8 inline-block rounded-full bg-teal px-6 py-3 font-medium text-ink"
          >
            約免費導入顧問
          </Link>
        </article>
        <section className="mt-12 space-y-3 text-sm text-cream-dim">
          <h2 className="text-lg text-cream">刻意不收的錢</h2>
          <p>沒有「CRM 加購」「行銷自動化加購」「產業包加購」。十萬是把現場接起來的年費，不是模組菜單。</p>
          <p>金流、簡訊、LINE 官方、電子發票屬外部網路服務，依各供應商計費，我們做適配不吃價差。</p>
          <p>第二年起同樣 NT$100,000／年，含版本升級與顧問時數內的流程微調。</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
