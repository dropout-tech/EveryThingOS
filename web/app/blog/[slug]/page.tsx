import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatPostDate, getPost, listPosts } from "@/lib/blog";
import { pageMeta } from "@/lib/seo";

export function generateStaticParams() {
  return listPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">) {
  const post = getPost((await params).slug);
  if (!post) return { title: "部落格" };
  const meta = pageMeta(`/blog/${post.slug}`, post.title, post.description);
  return { ...meta, openGraph: { ...meta.openGraph, type: "article", publishedTime: post.date } };
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const more = listPosts().filter((item) => item.slug !== post.slug).slice(0, 2);

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <article className="site-sheet space-y-5 p-6 sm:p-8">
          <nav aria-label="位置" className="text-sm text-cream-dim">
            <Link href="/blog" className="hover:text-cream">
              部落格
            </Link>
          </nav>
          <header className="space-y-3">
            <time dateTime={post.date} className="text-sm text-cream-dim">
              {formatPostDate(post.date)}
            </time>
            <h1 className="text-3xl font-medium sm:text-4xl">{post.title}</h1>
            <p className="text-cream-dim">{post.description}</p>
          </header>
          {post.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
        {more.length ? (
          <section className="mt-10 space-y-3" aria-labelledby="more-posts">
            <h2 id="more-posts" className="text-sm text-cream-dim">
              其他文章
            </h2>
            <ul className="space-y-3">
              {more.map((item) => (
                <li key={item.slug}>
                  <Link href={`/blog/${item.slug}`} className="site-sheet block p-4">
                    <span className="font-medium">{item.title}</span>
                    <span className="mt-1 block text-sm text-cream-dim">{formatPostDate(item.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
