import Link from "next/link";
import { glueAdmin, platformOperator, STAGE_LABEL, type PlatformAccount } from "@/lib/platform";
import type { Stage } from "@/lib/sources/config";

const ORDER: Stage[] = ["read_only", "past_due", "suspended", "due_soon", "trial", "active", "cancelled"];

function num(v: unknown) {
  return typeof v === "number" ? v : null;
}

export default async function PlatformPage() {
  const operator = (await platformOperator())!;
  const res = await glueAdmin<{ today: string; accounts: PlatformAccount[] }>("/admin/accounts", operator);
  if (!res.ok || !res.data) return <p className="text-orange">讀不到公司清單：{res.text || res.status}</p>;
  const { accounts, today } = res.data;
  const sorted = [...accounts].sort((a, b) => ORDER.indexOf(a.lifecycle.stage) - ORDER.indexOf(b.lifecycle.stage) || (a.lifecycle.ends ?? "9").localeCompare(b.lifecycle.ends ?? "9"));
  const count = (stage: Stage) => accounts.filter((a) => a.lifecycle.stage === stage).length;
  const seats = accounts.reduce((n, a) => n + (num(a.usage?.users) ?? 0), 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["公司", accounts.length],
          ["帳號", seats],
          ["試用", count("trial")],
          ["60 天內到期", count("due_soon")],
          ["寬限中", count("past_due")],
          ["只能看／暫停", count("read_only") + count("suspended")],
        ].map(([label, value]) => (
          <div key={label as string} className="glass p-4">
            <p className="text-xs text-cream-dim">{label}</p>
            <p className="mt-1 text-2xl">{value}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-cream-dim">今天 {today}（台灣）。用量每天凌晨兩點更新。</p>
      <section className="glass overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-cream-dim">
            <tr>
              {["公司", "狀態", "到期", "帳號／30 天活躍", "本月發票", "資料量", "網址"].map((h) => (
                <th key={h} className="px-4 py-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.site} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">
                  <Link href={`/platform/${encodeURIComponent(a.site)}`} className="hover:text-teal">
                    {a.company}
                  </Link>
                  <span className="block text-xs text-cream-dim">{a.site}</span>
                </td>
                <td className={`px-4 py-3 ${a.lifecycle.writable && a.lifecycle.stage !== "past_due" ? "" : "text-orange"}`}>{STAGE_LABEL[a.lifecycle.stage]}</td>
                <td className="px-4 py-3">{a.lifecycle.ends ?? "—"}</td>
                <td className="px-4 py-3">
                  {num(a.usage?.users) ?? "—"} ／ {num(a.usage?.active_users_30d) ?? "—"}
                </td>
                <td className="px-4 py-3">{num(a.usage?.invoices_this_month) ?? "—"}</td>
                <td className="px-4 py-3">{num(a.usage?.db_mb) !== null ? `${Math.round((num(a.usage?.db_mb) ?? 0) + (num(a.usage?.files_mb) ?? 0))} MB` : typeof a.usage?.error === "string" ? <span className="text-orange">讀不到</span> : "—"}</td>
                <td className="px-4 py-3 text-xs text-cream-dim">{a.hosts.join("、") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!accounts.length ? <p className="p-5 text-sm text-cream-dim">還沒有公司。用導入工具 `dropout-onboard provision` 或 `fleet` 開第一家。</p> : null}
      </section>
    </div>
  );
}
