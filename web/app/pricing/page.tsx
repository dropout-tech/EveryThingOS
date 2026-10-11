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
        <p className="display text-xs tracking-[0.22em] text-orange uppercase">年費</p>
        <h1 className="scene-type mt-3 text-4xl font-medium">{PRICE_LABEL}</h1>
        <p className="mt-4 text-cream-dim">{PRICE_NOTE}</p>
        <article className="glass glass-hero mt-10 p-8">
          <p className="text-sm text-cream-dim">DropOut OS 一年</p>
          <p className="mt-2 text-5xl font-medium">NT${formatted}</p>
          <p className="mt-2 text-cream-dim">一年 · 未稅 · 一間公司一份</p>
          <ul className="mt-6 space-y-3 text-cream-dim">
            <li>對齊鼎新 A1／億看：進銷存、帳款、稅、電子發票，不拆三張月租</li>
            <li>{n} 種行業，跟客人的階段與每天看的數字可以改</li>
            <li>免費顧問到現場：選定行業、搬資料、跑通一筆真實生意</li>
            <li>不收每人帳號費、不另外加購功能</li>
            <li>全畫面套琢奧識別</li>
          </ul>
          <Link href="/consulting" className="glass-cta mt-8 inline-block rounded-full px-6 py-3 font-medium">
            約免費導入顧問
          </Link>
        </article>
        <section className="mt-12 space-y-3 text-sm text-cream-dim">
          <h2 className="text-lg text-cream">刻意不收的錢</h2>
          <p>鼎新 A1 常把進銷存、會計、電子發票拆開月租；億看月費低但畫面密。這裡十萬含到現場帶，功能不另開帳單。</p>
          <p>金流、簡訊、LINE 官方、電子發票是外面的服務，依各家收費；我們幫你們接上，不抽成。</p>
          <p>第二年起同樣 NT$100,000／年，含更新，顧問時數內的流程微調也含。</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
