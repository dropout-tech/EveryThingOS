import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "官網" };

export default async function WebsitePage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="DropOut Site"
      title={`${pack.nameZh} 官方網站`}
      hint="Frappe Builder 套琢奧識別。表單提交進清庫再進 CRM，不是外掛 Wix。"
    >
      <div className="rounded-3xl border border-[var(--line)] bg-ink-2 p-8">
        <p className="display text-xs tracking-[0.2em] text-teal uppercase">Official site</p>
        <h3 className="mt-3 text-3xl">{pack.nameZh}</h3>
        <p className="mt-3 max-w-lg text-cream-dim">{pack.tagline}</p>
        <button type="button" className="mt-6 rounded-full bg-orange px-5 py-2 text-ink">
          留下資料（示範）
        </button>
        <p className="mt-4 text-xs text-cream-dim">真實送出會先打 Reacher，再寫入 Mautic 與 ERPNext。</p>
      </div>
    </ModuleFrame>
  );
}
