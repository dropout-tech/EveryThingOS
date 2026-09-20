import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { COMMERCIAL, CONSULTING_STEPS } from "@/lib/commercial";

export const metadata = { title: "免費顧問導入" };

export default function ConsultingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-teal uppercase">Free implementation</p>
        <h1 className="mt-3 text-4xl font-medium">顧問去現場，導入不另開帳單</h1>
        <p className="mt-4 text-cream-dim">
          年費已含導入。我們不另售「導入專案 30 萬」。懂商業的人跟第一線看同一筆資料，打開對的產業包，改你們的例外。
        </p>
        <ol className="mt-10 space-y-6">
          {CONSULTING_STEPS.map((step) => (
            <li key={step.id} className="border-l border-teal pl-5">
              <p className="display text-xs text-teal">{step.id}</p>
              <h2 className="mt-1 text-xl">{step.title}</h2>
              <p className="mt-1 text-cream-dim">{step.body}</p>
            </li>
          ))}
        </ol>
        <a
          href={`mailto:${COMMERCIAL.email}?subject=${encodeURIComponent("DropOut OS 免費導入")}`}
          className="mt-10 inline-block rounded-full bg-teal px-6 py-3 font-medium text-ink"
        >
          寫信約時間
        </a>
        <p className="mt-4 text-sm text-cream-dim">
          或先
          <Link href="/industries" className="mx-1 text-teal hover:underline">
            選一個最像的產業包
          </Link>
          再約。
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
