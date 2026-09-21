import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "魅力圈" };

export default async function FunnelPage() {
  const pack = await currentIndustry();
  const stages = ["吸引", "捕捉", "清庫", "養成", pack.fulfillment, "內圈回購"];

  return (
    <ModuleFrame
      kicker="魅力圈"
      title={`${pack.nameZh} 從看到進來`}
      hint="官網與落地頁走 Frappe Builder，序列走 Mautic。合格後進客人看板。"
    >
      <ol className="glass flex flex-col overflow-hidden md:flex-row">
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={`flex-1 px-4 py-5 ${index ? "border-t border-[var(--line)] md:border-t-0 md:border-l" : ""}`}
          >
            <p className="display text-[11px] text-cream-dim">{String(index + 1).padStart(2, "0")}</p>
            <p className="mt-2 text-lg">{stage}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm text-cream-dim">
        此產業：{pack.sampleLoop}。合格後進「{pack.workflow.stages[0]}」。
      </p>
    </ModuleFrame>
  );
}
