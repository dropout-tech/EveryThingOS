import Link from "next/link";
import { formatTwd, SALES_STEPS, buildBooks, salesByStep } from "@/lib/erp";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "生意" };

export default async function ErpHubPage() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);
  const columns = salesByStep(books);
  const firstOpen = columns.find((column) => column.docs.length) ?? columns[0];

  return (
    <div className="space-y-6">
      <ol className="glass flex flex-col gap-0 overflow-hidden md:flex-row">
        {columns.map((column, index) => (
          <li
            key={column.id}
            className={`flex-1 px-4 py-4 ${index ? "border-t border-[var(--line)] md:border-t-0 md:border-l" : ""}`}
          >
            <p className="display text-[11px] text-cream-dim">0{index + 1}</p>
            <p className="mt-2 text-lg">{column.plain}</p>
            <p className="mt-1 text-xs text-cream-dim">{column.docs.length} 張</p>
            {column.docs[0] ? (
              <p className="mt-2 truncate text-xs text-cream-dim">
                {column.docs[0].party} {formatTwd(column.docs[0].amount)}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-sm text-cream-dim">
        這家公司的履行是「{pack.fulfillment}」。
        {pack.modules.erp.inventory ? " 倉庫開著。" : " 倉庫已關。"}
        從「{firstOpen.plain}」接著做。
      </p>
      <Link href="/workspace/erp/sales" className="glass-cta rounded-full px-5 py-2.5 text-sm">
        從「{firstOpen.plain}」開始
      </Link>
      <details className="text-sm text-cream-dim">
        <summary className="cursor-pointer">現場用語對照會計／A1</summary>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {SALES_STEPS.map((step) => (
            <li key={step.id}>
              「{step.plain}」＝ {step.formal} ＝ A1 {step.a1Name}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
