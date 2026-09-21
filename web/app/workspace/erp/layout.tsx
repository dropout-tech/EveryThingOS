import { ErpSubnav } from "@/components/ErpSubnav";
import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export default async function ErpLayout({ children }: LayoutProps<"/workspace/erp">) {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="生意"
      title="進銷存與帳，用現場的話說"
      hint="報價到收款、進貨到付款、庫存、誰欠錢、營業稅與電子發票。先問下一步做什麼，不必先背單據名稱。"
    >
      <p className="glass-chip px-4 py-2 text-xs text-cream-dim">
        現在是練習帳。點下一步，數字會在這台電腦走動。還沒寫進你們真正的帳本。
      </p>
      <ErpSubnav showStock={pack.modules.erp.inventory} />
      {children}
    </ModuleFrame>
  );
}
