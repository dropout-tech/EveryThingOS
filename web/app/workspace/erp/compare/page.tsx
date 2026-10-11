import { ERP_PARITY } from "@/lib/erp";

export const metadata = { title: "對照 A1／億看" };

export default function ComparePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-cream-dim">
        對齊鼎新 A1 雲端進銷存、會計、電子發票，或億看那一檔。人事薪資、很深的工廠製程，用對的行業才打開，不會一次塞給買賣的店。
      </p>
      <div className="glass">
        <div className="sm:overflow-x-auto">
          <table className="table-stack sm:min-w-[56rem]">
            <thead className="bg-ink-2">
              <tr>
                <th scope="col">能力</th>
                <th scope="col">鼎新 A1</th>
                <th scope="col">億看 ECOUNT</th>
                <th scope="col">DropOut OS</th>
                <th scope="col">為什麼更好用</th>
              </tr>
            </thead>
            <tbody>
              {ERP_PARITY.map((row) => (
                <tr key={row.capability} className="align-top">
                  <td data-primary="">{row.capability}</td>
                  <td data-label="鼎新 A1" className="text-cream-dim">{row.a1}</td>
                  <td data-label="億看" className="text-cream-dim">{row.ecount}</td>
                  <td data-label="DropOut OS">{row.dropout}</td>
                  <td data-label="好在哪" className="font-medium">{row.better}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
