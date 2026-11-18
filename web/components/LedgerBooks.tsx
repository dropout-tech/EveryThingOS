import { formatTwd } from "@/lib/erp";
import type { LedgerHead } from "@/lib/ledger/types";

/** 收款頁上的測試帳本。數字來自 D1，重新整理還在。 */
export function LedgerBooks({ rows, error }: { rows: LedgerHead[]; error: string | null }) {
  return (
    <section className="space-y-3" aria-label="測試帳本">
      <h2 className="text-lg font-medium">測試帳本</h2>
      <p className="text-sm text-cream-dim">這一本是本機測試庫。單號、已收、餘額從資料庫讀出來。發票狀態是尚未開統一發票。</p>
      {error ? (
        <p className="text-sm text-orange" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length ? (
        <div className="glass sm:overflow-x-auto">
          <table className="table-stack sm:min-w-[36rem]">
            <thead className="bg-ink-2">
              <tr>
                <th scope="col">單號</th>
                <th scope="col">客人</th>
                <th scope="col">已收</th>
                <th scope="col">餘額</th>
                <th scope="col">發票</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.no}>
                  <td data-primary="">{row.no}</td>
                  <td data-label="客人">{row.party}</td>
                  <td data-label="已收">{formatTwd(row.received)}</td>
                  <td data-label="餘額">{formatTwd(row.balance)}</td>
                  <td data-label="發票">{row.invoiceStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? null : (
        <p className="text-sm text-cream-dim">還沒有單。到生意開一張報價，這裡會出現同一個單號。</p>
      )}
    </section>
  );
}
