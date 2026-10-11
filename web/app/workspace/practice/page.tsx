import { FirstSaleWalkthrough } from "@/components/FirstSaleWalkthrough";
import { ModuleFrame } from "@/components/ModuleFrame";
import { buildBooks } from "@/lib/erp";
import { practicePerson } from "@/lib/practice";
import { isLive } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "練習第一筆生意" };

export default async function PracticePage() {
  const pack = await currentIndustry();
  const live = await isLive("erpnext");

  return (
    <ModuleFrame kicker="練習" title="第一筆生意，先走一次" hint="報價 → 客人答應 → 出貨 → 請他付錢 → 收款。用練習帳本，按錯也沒關係。">
      <FirstSaleWalkthrough
        pack={{ id: pack.id, itemType: pack.itemType, fulfillment: pack.fulfillment, modules: pack.modules }}
        seed={buildBooks(pack).sales}
        person={practicePerson(pack.id, 5)}
        live={live}
      />
    </ModuleFrame>
  );
}
