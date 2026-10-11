import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { StockBoard } from "@/components/StockBoard";
import { getBooks } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "倉庫" };

export default async function StockPage() {
  const pack = await currentIndustry();
  const books = await getBooks(pack);
  if (books.origin === "error") return <SourceFailure source={books} next="/workspace/erp/stock" />;

  if (!pack.modules.erp.inventory) {
    return (
      <div className="rounded-2xl border border-gold/40 p-6">
        <h3 className="text-xl">這家公司沒有倉庫要管</h3>
        <p className="mt-2 text-cream-dim">
          履行是「{pack.fulfillment}」。A1／億看仍會把進銷存選單全部攤開；DropOut 依產業包把盤點藏起來，避免教育／顧問業去學品號。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StockBoard
        packId={pack.id}
        inventoryValue={books.data.inventoryValue}
        batchOn={pack.modules.erp.batch}
        stock={books.data.stock}
        purchases={books.data.purchases}
        deskUrl={books.origin === "live" ? books.deskUrl : undefined}
      />
      <SourceNote source={books} />
    </div>
  );
}
