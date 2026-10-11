import Link from "next/link";
import { ModuleFrame } from "@/components/ModuleFrame";
import { PRICE_LABEL } from "@/lib/commercial";
import { FEATURES, SIZES, sceneById } from "@/lib/shop";
import { currentIndustry, currentShop } from "@/lib/workspace";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const shop = await currentShop();
  const pack = await currentIndustry();
  const scene = sceneById(shop?.scene);
  const size = SIZES.find((item) => item.id === shop?.size);

  return (
    <ModuleFrame kicker="設定" title={pack.nameZh}>
      <div className="glass glass-hero space-y-5 p-6 md:p-8">
        <div>
          <p className="text-sm text-cream-dim">現場</p>
          <p className="mt-1">{scene.label} · {size?.label}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">打開的</p>
          <p className="mt-1">
            {FEATURES.filter((item) => shop?.modules.includes(item.id))
              .map((item) => item.label)
              .join("、") || "還沒選"}
          </p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">客人怎麼走</p>
          <p className="mt-1">{pack.workflow.stages.join(" → ")}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">現在還沒接上的</p>
          <p className="mt-1 text-sm leading-7 text-cream-dim">
            按下去只在這台電腦走。帳本、登入、寄信、IG、電子發票，導入時再接。
          </p>
        </div>
        <p className="flex flex-wrap gap-4 text-sm text-cream-dim">
          <Link href="/?setup=1" className="hover:text-cream">
            重設現場與功能
          </Link>
          <Link href="/pricing" className="hover:text-cream">
            {PRICE_LABEL}
          </Link>
        </p>
      </div>
    </ModuleFrame>
  );
}
