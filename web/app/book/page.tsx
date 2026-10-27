import { cookies } from "next/headers";
import { connection } from "next/server";
import { BookingForm, type BookableCourse } from "@/components/BookingForm";
import type { BookingChannel } from "@/lib/booking";
import { evaluateCourseBom } from "@/lib/course-bom";
import { applyLocks, decodeHolds, HOLD_COOKIE, openLabel, openSeats } from "@/lib/holds";
import { getBooks } from "@/lib/sources";
import { DEFAULT_BRAND } from "@/lib/brand";
import { liveConfig } from "@/lib/sources/config";
import { currentIndustry, currentShop } from "@/lib/workspace";

export const metadata = { title: "預約課程", robots: { index: false } };

const FROM: Record<string, BookingChannel> = { line: "LINE", ig: "Instagram", fb: "Facebook", phone: "電話", counter: "門市現場" };

function branchName(warehouse: string) {
  return warehouse.replace(/\s+-\s+[^-]+$/, "").replace(/倉$/, "").trim();
}

/**
 * 客人看到的預約頁。同一個網址貼到 LINE 圖文選單（?from=line）、IG／FB 個人頁（?from=ig、?from=fb）或門市平板（?from=counter），
 * 名額直接從課程 BOM 與材料庫存算，所以頁上說「可預約」就真的有料。
 */
export default async function BookPage({ searchParams }: PageProps<"/book">) {
  await connection();
  const [pack, shop, config] = await Promise.all([currentIndustry(), currentShop(), liveConfig()]);
  const storeName = shop?.name ?? config.tenant?.company ?? pack.nameZh;
  const { from } = await searchParams;
  const channel = (typeof from === "string" && FROM[from]) || "官網";
  const books = await getBooks(pack);
  const data = books.origin === "error" ? null : books.data;

  const holds = decodeHolds((await cookies()).get(HOLD_COOKIE)?.value);
  const courses: BookableCourse[] = (data?.courseBoms ?? []).map((bom) => {
    const evaluated = evaluateCourseBom(applyLocks(bom, holds), data?.stock ?? []);
    return { code: bom.courseCode, name: bom.courseName, label: openLabel(evaluated), full: openSeats(evaluated) <= 0 };
  });
  const branches = [...new Set((data?.stock ?? []).map((s) => branchName(s.warehouse)).filter(Boolean))];

  return (
    <div className="brand-page min-h-screen" data-brand={shop?.brand ?? DEFAULT_BRAND}>
    <main id="main" className="site-scope mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <header className="site-sheet p-6 sm:p-8">
        <p className="kicker">線上預約</p>
        <h1 className="mt-3 text-3xl font-medium">{storeName}</h1>
        <p className="mt-3 text-cream-dim">選課程、分店和時間。頁上顯示「可預約」時，名額和材料包都已經確認夠用。</p>
      </header>
      <div className="mt-6">
        {courses.length ? (
          <BookingForm courses={courses} branches={branches.length ? branches : ["門市"]} channel={channel} demo={books.origin === "demo"} />
        ) : (
          <div className="site-sheet p-6 text-cream-dim">這家店還沒開放線上預約，請直接傳 LINE 或打電話。</div>
        )}
      </div>
    </main>
    </div>
  );
}
