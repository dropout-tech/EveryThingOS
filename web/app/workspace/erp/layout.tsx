import { ErpSubnav } from "@/components/ErpSubnav";
import { isLive } from "@/lib/sources";
import { currentIndustry, currentShop } from "@/lib/workspace";

export default async function ErpLayout({ children }: LayoutProps<"/workspace/erp">) {
  const pack = await currentIndustry();
  const shop = await currentShop();
  const mods = shop?.modules ?? [];
  const live = await isLive("erpnext");

  return (
    <div className="space-y-5">
      <ErpSubnav
        showSales={mods.includes("sales")}
        showPurchase={mods.includes("purchase")}
        showStock={pack.modules.erp.inventory}
        showFinance={mods.includes("finance")}
        live={live}
      />
      <p className="text-xs text-cream-dim">{live ? "這裡的每一步都寫進 ERPNext，照你的角色權限。" : "練習帳：按了只改這台電腦的畫面，還沒寫進你們真正的帳本。"}</p>
      {children}
    </div>
  );
}
