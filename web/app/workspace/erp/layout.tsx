import { ErpSubnav } from "@/components/ErpSubnav";
import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export default async function ErpLayout({ children }: LayoutProps<"/workspace/erp">) {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="DropOut 生意"
      title="進銷存＋財務，用現場的話說"
      hint="對齊鼎新 A1 與億看 ECOUNT 的能力：報價到收款、採購到付款、庫存、帳齡、傳票、營業稅與電子發票。差別是先問「下一步做什麼」，而不是先背單據名稱。"
    >
      <p className="glass px-4 py-2 text-xs text-cream-dim">
        這是示範帳簿：點「下一步」會在這個瀏覽器裡走動，用來證明畫面比 A1／億看直觀。正式過帳會接到 ERPNext，現在還沒接上。
      </p>
      <ErpSubnav showStock={pack.modules.erp.inventory} />
      {children}
    </ModuleFrame>
  );
}
