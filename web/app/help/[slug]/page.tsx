import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpBlocks } from "@/components/HelpText";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { HELP, helpArticle } from "@/lib/help";

export function generateStaticParams() {
  return HELP.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const article = helpArticle(slug);
  return article ? { title: `${article.title}｜說明中心`, description: article.summary } : { title: "說明中心" };
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const article = helpArticle(slug);
  if (!article) notFound();
  const related = (article.related ?? []).map(helpArticle).filter((a) => a !== undefined);
  const sections = article.blocks.filter((b): b is { h: string; id: string } => "h" in b && Boolean(b.id));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <header className="glass-well p-6 md:p-8">
          <nav aria-label="位置" className="text-sm text-cream-dim">
            <Link href="/help" className="hover:text-cream">
              說明中心
            </Link>
            <span aria-hidden> / </span>
            <span>{article.category}</span>
          </nav>
          <h1 className="display mt-3 text-4xl font-medium">{article.title}</h1>
          <p className="mt-3 text-cream-dim">{article.summary}</p>
        </header>
        {sections.length > 2 ? (
          <nav aria-label="這篇的段落" className="mt-6 flex flex-wrap gap-2 text-sm">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="glass-well rounded-full px-3 py-1">
                {s.h}
              </a>
            ))}
          </nav>
        ) : null}
        <article className="glass-well mt-8 p-6 md:p-8">
          <HelpBlocks blocks={article.blocks} />
        </article>
        {related.length ? (
          <section className="mt-12" aria-labelledby="related">
            <h2 id="related" className="text-sm text-teal">
              接著看
            </h2>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {related.map((a) => (
                <li key={a.slug}>
                  <Link href={`/help/${a.slug}`} className="glass-well glass-lift block h-full rounded-2xl px-5 py-4">
                    <span className="block font-medium text-cream">{a.title}</span>
                    <span className="mt-1 block text-sm text-cream-dim">{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="mt-12 text-sm text-cream-dim">
          找不到答案？<Link href="/help" className="text-teal underline underline-offset-4">回說明中心搜尋</Link>，或直接問幫你導入的顧問。
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
