import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "把人帶來" };

export default async function FunnelPage() {
  const pack = await currentIndustry();
  const stages = ["被人看到", "留下資料", "持續聯絡", pack.fulfillment];

  return (
    <ModuleFrame kicker="把人帶來" title="從看到進來">
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
    </ModuleFrame>
  );
}
