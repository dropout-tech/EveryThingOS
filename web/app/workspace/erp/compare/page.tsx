import { ERP_PARITY } from "@/lib/erp";

export const metadata = { title: "對照 A1／億看" };

export default function ComparePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-cream-dim">
        目標等級：鼎新 A1 雲端進銷存＋會計＋電子發票，或億看 ECOUNT 全模組。能力對齊，操作改成現場語言。人事薪資、30 段製程工廠仍用產業包加開，不一次塞給買賣業。
      </p>
      <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-ink-2 text-cream-dim">
            <tr>
              <th className="px-4 py-3">能力</th>
              <th className="px-4 py-3">鼎新 A1</th>
              <th className="px-4 py-3">億看 ECOUNT</th>
              <th className="px-4 py-3">DropOut OS</th>
              <th className="px-4 py-3">為什麼更好用</th>
            </tr>
          </thead>
          <tbody>
            {ERP_PARITY.map((row) => (
              <tr key={row.capability} className="border-t border-[var(--line)] align-top">
                <td className="px-4 py-3">{row.capability}</td>
                <td className="px-4 py-3 text-cream-dim">{row.a1}</td>
                <td className="px-4 py-3 text-cream-dim">{row.ecount}</td>
                <td className="px-4 py-3">{row.dropout}</td>
                <td className="px-4 py-3 text-teal">{row.better}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
