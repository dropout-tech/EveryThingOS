import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "官網" };

export default async function WebsitePage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="官網"
      title={`${pack.nameZh} 官方網站`}
      hint="Frappe Builder 套琢奧識別。表單先清庫再進客人。"
    >
      <div className="glass glass-hero max-w-xl p-8">
        <p className="display text-xs tracking-[0.2em] text-cream-dim uppercase">Official site</p>
        <h3 className="mt-3 text-3xl">{pack.nameZh}</h3>
        <p className="mt-3 max-w-lg text-cream-dim">{pack.tagline}</p>
        <button type="button" className="glass-cta mt-6 rounded-full px-5 py-2">
          留下資料（示範）
        </button>
        <p className="mt-4 text-xs text-cream-dim">真實送出會先打 Reacher，再寫入 Mautic 與 ERPNext。</p>
      </div>
    </ModuleFrame>
  );
}
