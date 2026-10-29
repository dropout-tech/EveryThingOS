import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatPostDate, listPosts } from "@/lib/blog";
import { pageMeta } from "@/lib/seo";

export const metadata = {
  ...pageMeta("/blog", "部落格", "EveryThingOS 實際做了什麼、現在公開的是哪一層、哪些數字還不能當成已經入帳。"),
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function BlogPage() {
  const posts = listPosts();

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-3xl space-y-8 px-5 py-10 sm:py-14">
        <header className="space-y-3">
          <p className="text-sm text-cream-dim">琢奧科技</p>
          <h1 className="text-3xl font-medium sm:text-4xl">部落格</h1>
          <p className="text-cream-dim">只寫已經做在產品裡的事。訂閱可用 <Link href="/blog/rss.xml" className="underline underline-offset-4 hover:text-cream">RSS</Link>。</p>
        </header>
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="site-sheet block p-5 sm:p-6">
                <time dateTime={post.date} className="text-sm text-cream-dim">
                  {formatPostDate(post.date)}
                </time>
                <h2 className="mt-2 text-xl font-medium">{post.title}</h2>
                <p className="mt-2 text-sm text-cream-dim">{post.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
