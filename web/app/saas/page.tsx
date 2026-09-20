import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SAAS_MATRIX } from "@/lib/commercial";

export const metadata = { title: "取代這些 SaaS" };

export default function SaasPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-gold uppercase">Replace the stack</p>
        <h1 className="mt-3 text-4xl font-medium">企業正在併的那些工具，對進四支柱</h1>
        <p className="mt-4 max-w-2xl text-cream-dim">
          不是說全世界軟體都不需要。是中小企業為了「接單、跟進、出貨、收款、再行銷」不該同時養十五個帳號。
          DropOut OS 把這些收成同一個登入、同一份主檔。
        </p>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--line)]">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-ink-2 text-cream-dim">
              <tr>
                <th className="px-4 py-3">現在常見的 SaaS</th>
                <th className="px-4 py-3">例子</th>
                <th className="px-4 py-3">進 DropOut 哪一支柱</th>
              </tr>
            </thead>
            <tbody>
              {SAAS_MATRIX.map((row) => (
                <tr key={row.category} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3 text-cream-dim">{row.tools.join("、")}</td>
                  <td className="px-4 py-3 text-teal">{row.pillar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
