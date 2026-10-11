import { Hint } from "@/components/Hint";
import { RoleGuide } from "@/components/RoleGuide";
import { SetupChecklist } from "@/components/SetupChecklist";
import { SetupProgress } from "@/components/SetupProgress";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { TodayList } from "@/components/TodayBoard";
import { workspaceGuide } from "@/lib/guide-server";
import { getBooks, getSetup } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "今天" };

export default async function WorkspaceHome() {
  const pack = await currentIndustry();
  const [books, setup, guide] = await Promise.all([getBooks(pack), getSetup(), workspaceGuide(pack)]);
  if (books.origin === "error") return <SourceFailure source={books} />;

  return (
    <div className="space-y-6">
      <h1 className="sr-only">今天</h1>
      <RoleGuide allowed={guide.allowed} />
      <Hint id="today" help="module-today" />
      <TodayList books={books.data} />
      {guide.checklist ? (
        <SetupChecklist items={guide.checklist} practice={guide.practice} />
      ) : setup.origin === "live" && setup.data && setup.data.done < setup.data.total ? (
        <SetupProgress setup={setup.data} />
      ) : null}
      <SourceNote source={books} demoText="練習。導入後換成你們的客人與帳。" />
    </div>
  );
}
