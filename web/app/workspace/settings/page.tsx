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
        <div className="glass p-4">
          <dt className="text-sm text-cream-dim">目前產業包</dt>
          <dd className="mt-1">
            {pack.code} {pack.nameZh}
          </dd>
        </div>
        <div className="glass p-4">
          <dt className="text-sm text-cream-dim">流程階段</dt>
          <dd className="mt-1">{pack.workflow.stages.join(" → ")}</dd>
        </div>
        <div className="glass p-4">
          <dt className="text-sm text-cream-dim">LINE 通道</dt>
          <dd className="mt-1">{pack.modules.line ? "預設開啟（Chatwoot 適配器）" : "此包預設關閉，可再開"}</dd>
        </div>
        <div className="glass p-4">
          <dt className="text-sm text-cream-dim">介面</dt>
          <dd className="mt-1">黑／白 + 蘋果 Liquid Glass。右上角切換顏色，卡片與導覽用玻璃材質。</dd>
        </div>
        <div className="glass p-4">
          <dt className="text-sm text-cream-dim">對齊等級</dt>
          <dd className="mt-1">鼎新 A1 進銷存＋會計＋電子發票，或億看 ECOUNT 全模組。畫面改成下一步，不改成更多選單。</dd>
        </div>
        <div className="glass p-4 md:col-span-2">
          <dt className="text-sm text-cream-dim">還沒接到現場的</dt>
          <dd className="mt-1 text-sm leading-7 text-cream-dim">
            ERPNext 過帳、Keycloak 登入、Mautic 魅力圈、Reacher 清庫、Shlink 短網址、電子發票加值中心、公開預覽網址（Vercel 還沒接到 GitHub）。
            現在這層是產品殼與示範帳簿，用來把操作與外觀定下來。
          </dd>
        </div>
      </dl>
    </ModuleFrame>
  );
}
