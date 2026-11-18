import { Hint } from "@/components/Hint";
import { SalesBoard } from "@/components/SalesBoard";
import { ledgerToSalesDoc } from "@/lib/ledger/view";
import { readLedger } from "@/lib/ledger/read";
import { currentIndustry } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "銷售流水" };

export default async function SalesPage() {
  const pack = await currentIndustry();
  const ledger = await readLedger();
  const docs = ledger.rows.map((row) => ledgerToSalesDoc(row, pack));

  return (
    <div className="space-y-4">
      <Hint id="sales" help="module-sales" />
      <p className="text-sm text-cream-dim">測試帳本。報價寫進本機資料庫，重新整理還在。稅由伺服器用未稅加 5% 算成整數新台幣。</p>
      {ledger.error ? (
        <p className="text-sm text-orange" role="alert">
          {ledger.error}
        </p>
      ) : null}
      <SalesBoard pack={pack} initial={docs} ledger />
    </div>
  );
}
