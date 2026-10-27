import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
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
      <Hint id="sales" help="module-sales" />
      {books.origin === "live" && !books.data.sales.length ? (
        <EmptyState
          title="還沒有任何一張單"
          detail="先在下面開第一張報價；不確定怎麼走，可以先在練習帳本上走一次，不會動到真的帳。"
          action={{ href: "/workspace/practice", label: "先練習一筆生意" }}
          help="module-sales"
        />
      ) : null}
      <SalesBoard
        pack={pack}
        initial={books.data.sales}
        deskUrl={books.origin === "live" ? books.deskUrl : undefined}
        catalog={catalog}
      />
      <SourceNote source={books} />
    </div>
  );
}
