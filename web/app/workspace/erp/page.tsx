import Link from "next/link";
import { formatTwd, SALES_STEPS, buildBooks, salesByStep } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "生意" };

export default async function ErpHubPage() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);
  const columns = salesByStep(books);

  return (
    <div className="space-y-8">
      <ol className="grid gap-2 md:grid-cols-5">
        {columns.map((column, index) => (
          <li key={column.id} className="glass p-3">
            <p className="display text-[11px] text-teal">
              {index + 1}. {column.plain}
            </p>
            <p className="mt-1 text-sm text-cream-dim">
              {column.formal} · A1 叫{column.a1Name}
            </p>
            <p className="mt-3 display text-2xl">{column.docs.length}</p>
            {column.docs[0] ? (
              <p className="mt-1 truncate text-xs text-cream-dim">
                {column.docs[0].party} {formatTwd(column.docs[0].amount)}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-sm text-cream-dim">
        這家公司的履行是「{pack.fulfillment}」，物項是「{pack.itemType}」。
        {pack.modules.erp.inventory ? " 倉庫開著。" : " 倉庫已關，不會出現盤點。"}
        {pack.modules.erp.manufacturing ? " 工單／BOM 開著。" : " 沒有工廠選單。"}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/workspace/erp/sales" className="glass-cta rounded-full px-4 py-2 text-sm">
          從「客人在問」開始
        </Link>
        <Link href="/workspace/erp/compare" className="glass-pill px-4 py-2 text-sm">
          和 A1／億看一項一項對
        </Link>
      </div>
      <ul className="grid gap-2 text-sm text-cream-dim md:grid-cols-2">
        {SALES_STEPS.map((step) => (
          <li key={step.id}>
            現場說「{step.plain}」＝ 會計說「{step.formal}」＝ A1「{step.a1Name}」
          </li>
        ))}
      </ul>
    </div>
  );
}
