import { FinanceBoard } from "@/components/FinanceBoard";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { getBooks } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "帳款與稅" };

export default async function FinancePage() {
  const pack = await currentIndustry();
  const books = await getBooks(pack);
  if (books.origin === "error") return <SourceFailure source={books} next="/workspace/erp/finance" />;
  return (
    <div className="space-y-4">
      <FinanceBoard packId={pack.id} books={books.data} live={books.origin === "live"} />
      <SourceNote source={books} />
    </div>
  );
}
