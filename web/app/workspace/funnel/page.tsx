import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "魅力圈" };

export default async function FunnelPage() {
  const pack = await currentIndustry();
  const stages = ["被人看到", "留下資料", "擋假信", "持續聯絡", pack.fulfillment, "熟客再買"];

  return (
    <ModuleFrame
      kicker="魅力圈"
      title={`${pack.nameZh} 從看到進來`}
      hint="官網、活動頁、後續信件都在這裡。名單過了再進客人。"
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
        這一行平常怎麼走：{pack.sampleLoop}。過了之後進「{pack.workflow.stages[0]}」。
      </p>
    </ModuleFrame>
  );
}
