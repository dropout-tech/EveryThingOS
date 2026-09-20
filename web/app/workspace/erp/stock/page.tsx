import { StockBoard } from "@/components/StockBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "倉庫" };

export default async function StockPage() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);

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
    <StockBoard
      packId={pack.id}
      inventoryValue={books.inventoryValue}
      batchOn={pack.modules.erp.batch}
      stock={books.stock}
      purchases={books.purchases}
    />
  );
}
