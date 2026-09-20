import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "魅力圈" };

export default async function FunnelPage() {
  const pack = await currentIndustry();
  const stages = ["吸引", "捕捉", "清庫", "養成", pack.fulfillment, "內圈回購"];

  return (
    <ModuleFrame
      kicker="DropOut Funnel"
      title={`${pack.nameZh} 魅力圈`}
      hint="官網與落地頁走 Frappe Builder，序列與計分走 Mautic。對外仍是 DropOut 皮。"
    >
      <ol className="grid gap-3 md:grid-cols-3">
        {stages.map((stage, index) => (
          <li key={stage} className="rounded-2xl border border-[var(--line)] p-4">
            <p className="display text-xs text-teal">{String(index + 1).padStart(2, "0")}</p>
            <p className="mt-2 text-lg">{stage}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm text-cream-dim">
        此產業預設工作流：{pack.sampleLoop}。行銷合格後進 CRM 階段「{pack.workflow.stages[0]}」。
      </p>
    </ModuleFrame>
  );
}
