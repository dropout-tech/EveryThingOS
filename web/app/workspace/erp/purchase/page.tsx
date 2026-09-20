import { PurchaseBoard } from "@/components/PurchaseBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "採購入庫" };

export default async function PurchasePage() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);

  return (
    <PurchaseBoard
      packId={pack.id}
      inventory={pack.modules.erp.inventory}
      fulfillment={pack.fulfillment}
      initial={books.purchases}
    />
  );
}
