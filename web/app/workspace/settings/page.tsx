import { AppearanceBar } from "@/components/AppearanceBar";
import { ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="設定"
      title="這家公司可以改的"
      hint="行業先決定會看到哪些欄位。黑白與風景在右上角「外觀」。"
    >
      <div className="glass glass-hero space-y-5 p-6 md:p-8">
        <div>
          <p className="text-sm text-cream-dim">現在這一行</p>
          <p className="mt-1 text-lg">
            {pack.code} {pack.nameZh}
          </p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">客人怎麼往前走</p>
          <p className="mt-1">{pack.workflow.stages.join(" → ")}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">外觀</p>
          <p className="mt-1 text-sm text-cream-dim">黑或白、海或山或湖。換了畫面會跟著亮或暗。</p>
          <div className="mt-3">
            <AppearanceBar />
          </div>
        </div>
        <div>
          <p className="text-sm text-cream-dim">現在還沒接到現場的</p>
          <p className="mt-1 text-sm leading-7 text-cream-dim">
            現在按下去，數字只在這台電腦裡走。還沒連上真正的帳本與庫存、每人自己的登入、真的寄信、真的擋假信、真的短網址點擊、真的 IG 私訊、真的電子發票上傳。先練每天這四步，顧問導入時再一項一項接上。
          </p>
        </div>
      </div>
    </ModuleFrame>
  );
}
