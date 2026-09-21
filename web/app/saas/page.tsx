import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SAAS_MATRIX } from "@/lib/commercial";
import { ERP_PARITY } from "@/lib/erp";

export const metadata = { title: "取代這些 SaaS" };

export default function SaasPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-gold uppercase">Replace the stack</p>
        <h1 className="scene-type mt-3 text-4xl font-medium">先取代鼎新 A1 或億看 ECOUNT</h1>
        <p className="mt-4 max-w-2xl text-cream-dim">
          能力對齊台灣中小企業最常用的兩套雲端進銷存／ERP。更好用的地方：現場語言、產業包藏欄位、今天先做一件、以及它們沒有的行銷閉環。
        </p>
        <div className="glass mt-10 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-ink-2 text-cream-dim">
              <tr>
                <th className="px-4 py-3">能力</th>
                <th className="px-4 py-3">鼎新 A1</th>
                <th className="px-4 py-3">億看 ECOUNT</th>
                <th className="px-4 py-3">DropOut 為什麼更好用</th>
              </tr>
            </thead>
            <tbody>
              {ERP_PARITY.map((row) => (
                <tr key={row.capability} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3">{row.capability}</td>
                  <td className="px-4 py-3 text-cream-dim">{row.a1}</td>
                  <td className="px-4 py-3 text-cream-dim">{row.ecount}</td>
                  <td className="px-4 py-3 text-teal">{row.better}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mt-14 text-2xl">其他常被併進來的工具</h2>
        <div className="glass mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-ink-2 text-cream-dim">
              <tr>
                <th className="px-4 py-3">現在常見的 SaaS</th>
                <th className="px-4 py-3">例子</th>
                <th className="px-4 py-3">進 DropOut</th>
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
