import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="Workspace"
      title="這家公司可改的東西"
      hint="對標 Odoo Studio，但用 Frappe Workspace／Workflow，不另收費。"
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
          <dt className="text-sm text-cream-dim">識別</dt>
          <dd className="mt-1">全模組套 DropOut logo、墨色底、青綠與橘色。開源原廠名稱不出現在員工畫面。</dd>
        </div>
      </dl>
    </ModuleFrame>
  );
}
