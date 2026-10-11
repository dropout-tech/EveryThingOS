import Link from "next/link";
import { AutomationsBoard } from "@/components/AutomationsBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceNote } from "@/components/SourceNote";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { demoFacts } from "@/lib/automations";
import { loadAutomations } from "@/lib/automations-server";
import { buildBooks } from "@/lib/erp";
import { demoRecords, currentIndustry } from "@/lib/workspace";

export const metadata = { title: "自動化" };

const TITLE = "該追的事，讓系統自己追";
const HINT = "逾期的錢、沒回的報價、沒人跟的新客人、快沒貨的商品，打開一條規則，系統每天幫你提醒對的人。先看今天會碰到哪些，再決定要不要打開。";

export default async function AutomationsPage() {
  const pack = await currentIndustry();
  const source = await loadAutomations();

  if (source.origin === "denied" || source.origin === "error") {
    return (
      <ModuleFrame kicker="自動化" title={TITLE} hint={HINT}>
        {source.origin === "denied" ? (
          <p className="glass p-5 text-sm text-cream-dim">{source.message}。需要的話請老闆到「團隊」調整你的職務。</p>
        ) : (
          <section className="glass space-y-2 p-5" role="alert">
            <p className="font-medium">現在拿不到自動化的設定</p>
            <p className="text-sm text-cream-dim">{source.message}。規則還是照原本的設定在跑；稍後再整理一次。</p>
          </section>
        )}
        <p className="text-sm">
          <Link href="/help/module-automations" className={buttonClass({ variant: "ghost", size: "sm" })}>
            自動化怎麼用（說明）
          </Link>
        </p>
      </ModuleFrame>
    );
  }

  const live = source.origin === "live";
  const facts = live ? null : demoFacts(buildBooks(pack), demoRecords(pack).leads, pack.nameZh);

  return (
    <ModuleFrame kicker="自動化" title={TITLE} hint={HINT} badge={live ? undefined : <Badge tone="demo" />}>
      <AutomationsBoard packId={pack.id} live={live ? source.data : null} facts={facts} stockOn={pack.modules.erp.inventory} readOnly={live ? source.readOnly : null} />
      <SourceNote
        source={live ? { origin: "live", system: "glue", data: null } : { origin: "demo", data: null }}
        demoText="示範資料。開關和跑過的紀錄只存在這個分頁；接上系統同步後，規則每天早上照 ERPNext 的真資料跑。"
      />
      <p className="text-sm">
        <Link href="/help/module-automations" className="text-cream-dim underline hover:text-cream">
          每條規則會碰到 ERPNext 的哪些資料、怎麼關掉（說明）
        </Link>
      </p>
    </ModuleFrame>
  );
}
