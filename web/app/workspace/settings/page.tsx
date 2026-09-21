import { AppearanceBar } from "@/components/AppearanceBar";
import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="設定"
      title="這家公司可改的東西"
      hint="產業包先藏欄位。外觀在右上角。不另收 Studio 費。"
    >
      <div className="glass glass-hero space-y-5 p-6 md:p-8">
        <div>
          <p className="text-sm text-cream-dim">目前產業包</p>
          <p className="mt-1 text-lg">
            {pack.code} {pack.nameZh}
          </p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">客人階段</p>
          <p className="mt-1">{pack.workflow.stages.join(" → ")}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">外觀</p>
          <p className="mt-1 text-sm text-cream-dim">黑／白與海／山／湖。玻璃要靠風景折射。</p>
          <div className="mt-3">
            <AppearanceBar />
          </div>
        </div>
        <div>
          <p className="text-sm text-cream-dim">還沒接到現場的</p>
          <p className="mt-1 text-sm leading-7 text-cream-dim">
            ERPNext 過帳、Keycloak、Mautic、Reacher、Shlink、OpenReply Meta webhook、電子發票加值中心。現在是產品殼。
          </p>
        </div>
      </div>
    </ModuleFrame>
  );
}
