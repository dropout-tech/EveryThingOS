import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "官網" };

export default async function WebsitePage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="官網"
      title={`${pack.nameZh} 官方網站`}
      hint="畫面套琢奧識別。客人留下資料前，先確認信箱不是假的，再進客人。"
    >
      <div className="glass glass-hero max-w-xl p-8">
        <p className="display text-xs tracking-[0.2em] text-cream-dim uppercase">官方網站</p>
        <h3 className="mt-3 text-3xl">{pack.nameZh}</h3>
        <p className="mt-3 max-w-lg text-cream-dim">{pack.tagline}</p>
        <button type="button" className="glass-cta mt-6 rounded-full px-5 py-2">
          留下資料（練習）
        </button>
        <p className="mt-4 text-xs text-cream-dim">真的送出時：先檢查信箱，再進客人與後續聯絡。現在這個按鈕只是練習。</p>
      </div>
    </ModuleFrame>
  );
}
