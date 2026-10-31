import Link from "next/link";
import { OnboardScreen } from "@/components/OnboardScreen";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ModuleGrid, SiteHero, TrustStrip } from "@/components/SiteSections";
import { formatPostDate, listPosts } from "@/lib/blog";
import { COMMERCIAL } from "@/lib/commercial";

export const metadata = {
  title: { absolute: "EveryThingOS｜不用 AI 免費，AI 版一年含稅 NT$69,000" },
  description: "客人、進銷存、帳、人事薪資可以免費使用。AI 版一年含稅 NT$69,000。現在 AI 用量不限，以後會限量，限量前會先寫在價格頁。",
  alternates: { canonical: "/" },
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  if ((await searchParams).setup === "1") return <OnboardScreen />;
  const posts = listPosts().slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-14 px-5 py-8 sm:py-10">
        <SiteHero />
        <p className="text-sm text-cream-dim">
          {COMMERCIAL.legalName}
          <Link href="/login" className="ml-4 underline underline-offset-4 hover:text-cream">
            登入
          </Link>
          <Link href="/blog" className="ml-4 underline underline-offset-4 hover:text-cream">
            看部落格
          </Link>
        </p>
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
          <ul className="site-ruled">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="site-row">
                  <time dateTime={post.date} className="text-sm text-cream-dim">
                    {formatPostDate(post.date)}
                  </time>
                  <span className="min-w-0">
                    <span className="block text-lg font-medium">{post.title}</span>
                    <span className="mt-1 block text-sm text-cream-dim">{post.description}</span>
                  </span>
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
