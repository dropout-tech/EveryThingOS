import { ErpSubnav } from "@/components/ErpSubnav";
import { currentIndustry, currentShop } from "@/lib/workspace";

export default async function ErpLayout({ children }: LayoutProps<"/workspace/erp">) {
  const pack = await currentIndustry();
  const shop = await currentShop();
  const mods = shop?.modules ?? [];

  return (
    <div className="space-y-5">
      <p className="text-xs text-cream-dim">練習帳。還沒寫進你們真正的帳本。</p>
      <ErpSubnav
        showSales={mods.includes("sales")}
        showPurchase={mods.includes("purchase")}
        showStock={pack.modules.erp.inventory}
        showFinance={mods.includes("finance")}
      />
      {children}
    </div>
  );
}
