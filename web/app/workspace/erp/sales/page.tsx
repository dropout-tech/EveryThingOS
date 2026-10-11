import { SalesBoard } from "@/components/SalesBoard";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { getBooks, getCatalog } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "銷售流水" };

export default async function SalesPage() {
  const pack = await currentIndustry();
  const [books, catalog] = await Promise.all([getBooks(pack), getCatalog()]);
  if (books.origin === "error") return <SourceFailure source={books} next="/workspace/erp/sales" />;

  return (
    <div className="space-y-4">
      <SalesBoard
        pack={{
          id: pack.id,
          itemType: pack.itemType,
          fulfillment: pack.fulfillment,
          modules: pack.modules,
        }}
        initial={books.data.sales}
        deskUrl={books.origin === "live" ? books.deskUrl : undefined}
        catalog={catalog}
      />
      <SourceNote source={books} />
    </div>
  );
}
