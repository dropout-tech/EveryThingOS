import { FinanceBoard } from "@/components/FinanceBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "帳款與稅" };

export default async function FinancePage() {
  const pack = await currentIndustry();
  return <FinanceBoard packId={pack.id} books={buildBooks(pack)} />;
}
