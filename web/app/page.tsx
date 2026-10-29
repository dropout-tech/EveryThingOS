import Link from "next/link";
import { OnboardScreen } from "@/components/OnboardScreen";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ModuleGrid, TrustStrip } from "@/components/SiteSections";
import { formatPostDate, listPosts } from "@/lib/blog";
import { COMMERCIAL, PRICE_YEAR_TWD } from "@/lib/commercial";

export const metadata = {
  title: { absolute: "EveryThingOS｜台灣中小企業的 CRM、進銷存、財務與薪資，一年 NT$100,000" },
  description: "客人、進銷存、帳、人事薪資、老闆報表、對話與電子報，一個登入做完。對齊鼎新 A1／億看，每年 NT$100,000 未稅，不限帳號，含顧問到現場導入。",
  alternates: { canonical: "/" },
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  if ((await searchParams).setup === "1") return <OnboardScreen />;
  const posts = listPosts().slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-14 px-5 py-10 sm:py-14">
        <section className="site-sheet p-6 sm:p-10" aria-labelledby="home-title">
          <p className="text-sm text-cream-dim">{COMMERCIAL.legalName}</p>
          <h1 id="home-title" className="mt-3 text-3xl leading-tight font-medium sm:text-5xl">
            客人、進銷存、帳、薪資，
            <br />
            一個登入做完。
          </h1>
          <p className="mt-4 max-w-2xl text-cream-dim sm:text-lg">{COMMERCIAL.audience}進銷存與帳對齊鼎新 A1／億看，畫面只問「下一步是什麼」。</p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-medium sm:text-4xl">NT${PRICE_YEAR_TWD.toLocaleString("zh-TW")}</p>
            <p className="text-cream-dim">一年・未稅・一間公司・不限帳號・含顧問到現場導入</p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
            <Link href="/?setup=1" className="glass-pill px-6 py-3">
              先看示範
            </Link>
            <Link href="/login" className="glass-pill px-6 py-3">
              登入
            </Link>
            <Link href="/blog" className="text-cream-dim underline underline-offset-4 hover:text-cream">
              看部落格
            </Link>
          </div>
        </section>
        <ModuleGrid />
        <section className="space-y-4" aria-labelledby="latest">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="latest" className="text-2xl font-medium">
              最近寫的
            </h2>
            <Link href="/blog" className="text-sm text-cream-dim underline underline-offset-4 hover:text-cream">
              全部文章
            </Link>
          </div>
          <ul className="grid gap-3 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="site-sheet block h-full p-5">
                  <time dateTime={post.date} className="text-sm text-cream-dim">
                    {formatPostDate(post.date)}
                  </time>
                  <h3 className="mt-2 text-lg font-medium">{post.title}</h3>
                  <p className="mt-2 text-sm text-cream-dim">{post.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
