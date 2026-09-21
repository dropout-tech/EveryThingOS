import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="Workspace"
      title="這家公司可改的東西"
      hint="對標 Odoo Studio／A1 參數設定，但用產業包先藏欄位。不另收 Studio 費。"
    >
      <dl className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <dt className="text-sm text-cream-dim">目前產業包</dt>
          <dd className="mt-1">
            {pack.code} {pack.nameZh}
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <dt className="text-sm text-cream-dim">流程階段</dt>
          <dd className="mt-1">{pack.workflow.stages.join(" → ")}</dd>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <dt className="text-sm text-cream-dim">LINE 通道</dt>
          <dd className="mt-1">{pack.modules.line ? "預設開啟（Chatwoot 適配器）" : "此包預設關閉，可再開"}</dd>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <dt className="text-sm text-cream-dim">介面</dt>
          <dd className="mt-1">黑／白兩套，右上角切換。沒有第三套彩色皮。</dd>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <dt className="text-sm text-cream-dim">對齊等級</dt>
          <dd className="mt-1">鼎新 A1 進銷存＋會計＋電子發票，或億看 ECOUNT 全模組。畫面改成下一步，不改成更多選單。</dd>
        </div>
      </dl>
    </ModuleFrame>
  );
}
