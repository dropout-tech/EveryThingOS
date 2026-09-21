import { DailyFlow, MoneyStrip, TodayList } from "@/components/TodayBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "今天" };

export default async function WorkspaceHome() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);

  return (
    <div className="space-y-6">
      <header>
        <p className="scene-type display text-xs tracking-[0.2em] uppercase">今天</p>
        <h2 className="scene-type mt-1 text-3xl font-medium">{pack.nameZh}</h2>
        <p className="mt-2 max-w-xl text-sm text-cream-dim">{pack.tagline}</p>
      </header>
      <TodayList books={books} />
      <MoneyStrip books={books} />
      <DailyFlow />
    </div>
  );
}
