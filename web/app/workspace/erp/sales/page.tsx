import { SalesBoard } from "@/components/SalesBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "銷售流水" };

export default async function SalesPage() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);

  return (
    <SalesBoard
      pack={{
        id: pack.id,
        itemType: pack.itemType,
        fulfillment: pack.fulfillment,
        modules: pack.modules,
      }}
      initial={books.sales}
    />
  );
}
