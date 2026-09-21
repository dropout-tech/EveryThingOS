import { TodayList } from "@/components/TodayBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "今天" };

export default async function WorkspaceHome() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);

  return (
    <div className="space-y-6">
      <TodayList books={books} />
      <p className="text-xs text-cream-dim">練習。導入後換成你們的客人與帳。</p>
    </div>
  );
}
