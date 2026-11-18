import { FinanceBoard } from "@/components/FinanceBoard";
import { Hint } from "@/components/Hint";
import { LedgerBooks } from "@/components/LedgerBooks";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { readLedger } from "@/lib/ledger/read";
import { getBooks } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "帳款與稅" };

export default async function FinancePage() {
  const pack = await currentIndustry();
  const [books, ledger] = await Promise.all([getBooks(pack), readLedger()]);
  return (
    <div className="space-y-4">
      <Hint id="finance" help="module-finance" />
      <LedgerBooks rows={ledger.rows} error={ledger.error} />
      {books.origin === "error" ? (
        <SourceFailure source={books} next="/workspace/erp/finance" />
      ) : (
        <>
          <FinanceBoard packId={pack.id} books={books.data} live={books.origin === "live"} hideUpload />
          <SourceNote source={books} />
        </>
      )}
    </div>
  );
}
