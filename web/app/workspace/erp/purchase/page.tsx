import { PurchaseBoard } from "@/components/PurchaseBoard";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { getBooks } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "採購入庫" };

export default async function PurchasePage() {
  const pack = await currentIndustry();
  const books = await getBooks(pack);
  if (books.origin === "error") return <SourceFailure source={books} next="/workspace/erp/purchase" />;

  return (
    <div className="space-y-4">
      <PurchaseBoard
        packId={pack.id}
        inventory={pack.modules.erp.inventory}
        fulfillment={pack.fulfillment}
        initial={books.data.purchases}
        live={books.origin === "live"}
      />
      <SourceNote source={books} />
    </div>
  );
}
