import { cookies } from "next/headers";
import { BookingLinks } from "@/components/BookingLinks";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { StockBoard } from "@/components/StockBoard";
import { applyLocks, decodeHolds, HOLD_COOKIE, holdLines, stockPressure } from "@/lib/holds";
import { ledgerHolds, mergeHolds } from "@/lib/practice-ledger";
import { tradeOf } from "@/lib/trade";
import { shelfFor } from "@/lib/scene-shelf";
import { getBooks } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "倉庫" };

export default async function StockPage() {
  const pack = await currentIndustry();
  const books = await getBooks(pack);
  if (books.origin === "error") return <SourceFailure source={books} next="/workspace/erp/stock" />;

  if (!pack.modules.erp.inventory) {
    return (
      <div className="glass p-6">
        <h2 className="text-xl font-medium">這家公司沒有倉庫要管</h2>
        <p className="mt-2 text-cream-dim">
          這家是{pack.nameZh}，做到的是「{pack.fulfillment}」。沒有倉庫，所以不出現品號。
        </p>
      </div>
    );
  }

  const holds = mergeHolds(decodeHolds((await cookies()).get(HOLD_COOKIE)?.value), ledgerHolds(pack.id));
  const shelf = shelfFor(pack);
  const trade = tradeOf(pack);
  const courseBoms = (books.data.courseBoms ?? []).map((bom) => applyLocks(bom, holds));
  return (
    <div className="space-y-4">
      <StockBoard
        packId={pack.id}
        inventoryValue={books.data.inventoryValue}
        batchOn={pack.modules.erp.batch || books.data.stock.some((row) => row.batch)}
        stock={books.data.stock}
        courseBoms={courseBoms}
        purchases={books.data.purchases}
        live={books.origin === "live"}
        deskUrl={books.origin === "live" ? books.deskUrl : undefined}
        fromBookings={holdLines(holds)}
        bookingLocks={stockPressure(holds, courseBoms)}
        caption={shelf.caption}
        holdBuy={shelf.holdBuy}
        stopSell={trade.stopSell}
        waste={trade.waste}
        sales={books.data.sales}
      />
      {courseBoms.length ? <BookingLinks /> : null}
      <SourceNote source={books} />
    </div>
  );
}
