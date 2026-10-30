import type { Metadata } from "next";
import Link from "next/link";
import { HelpSearch } from "@/components/HelpSearch";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "說明中心",
  description: "EveryThingOS 怎麼開始、怎麼匯入資料、每個功能怎麼用、權限、續約和資料匯出。",
};

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const { q } = await searchParams;
  const initial = typeof q === "string" ? q.slice(0, 80) : "";

  return (
    <>
      <SiteHeader />
      <main className="site-scope mx-auto max-w-4xl px-5 py-14">
        <header>
          <h1 className="site-display text-4xl">有問題，先找這裡</h1>
          <p className="mt-3 max-w-2xl text-cream-dim">
            說明中心。從第一天登入、匯入客人和商品，到每個畫面怎麼用、誰看得到什麼、續約和把資料帶走。不用登入就能看。
          </p>
        </header>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/help/start" className="glass-well rounded-full px-3 py-1.5">
            第一個小時
          </Link>
          <Link href="/help/octalysis" className="glass-well rounded-full px-3 py-1.5">
            畫面為什麼這樣排
          </Link>
          <Link href="/help/import-data" className="glass-well rounded-full px-3 py-1.5">
            匯入資料
          </Link>
          <Link href="/workspace/practice" className="glass-well rounded-full px-3 py-1.5">
            練習第一筆生意
          </Link>
        </div>
        <div className="mt-8">
          <HelpSearch initial={initial} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
