import Link from "next/link";
import { ModuleFrame } from "@/components/ModuleFrame";
import { PRICE_LABEL } from "@/lib/commercial";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame kicker="設定" title={pack.nameZh}>
      <div className="glass glass-hero space-y-5 p-6 md:p-8">
        <div>
          <p className="text-sm text-cream-dim">客人怎麼走</p>
          <p className="mt-1">{pack.workflow.stages.join(" → ")}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">現在還沒接上的</p>
          <p className="mt-1 text-sm leading-7 text-cream-dim">
            按下去只在這台電腦走。帳本、登入、寄信、擋假信、短網址、IG、電子發票，導入時再接。
          </p>
        </div>
        <p className="text-sm text-cream-dim">
          <Link href="/pricing" className="hover:text-cream">
            {PRICE_LABEL}
          </Link>
          <span> · 含顧問到現場</span>
        </p>
      </div>
    </ModuleFrame>
  );
}
