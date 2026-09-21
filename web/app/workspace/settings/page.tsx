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
      hint="行業先決定會看到哪些欄位與今天要做的事。黑白在右上角「外觀」。往下滑，海會變深。"
    >
      <div className="glass glass-hero space-y-5 p-6 md:p-8">
        <div>
          <p className="text-sm text-cream-dim">現在這一行</p>
          <p className="mt-1 text-lg">{pack.nameZh}</p>
          <p className="mt-1 text-sm text-cream-dim">{pack.group} · {pack.tagline}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">客人怎麼往前走</p>
          <p className="mt-1">{pack.workflow.stages.join(" → ")}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">外觀</p>
          <p className="mt-1 text-sm text-cream-dim">黑或白。背景是同一條海：上面海面，往下滑到海底。</p>
          <div className="mt-3">
            <AppearanceBar />
          </div>
        </div>
        <div>
          <p className="text-sm text-cream-dim">現在還沒接到現場的</p>
          <p className="mt-1 text-sm leading-7 text-cream-dim">
            現在按下去，數字只在這台電腦裡走。還沒連上真正的帳本與庫存、每人自己的登入、真的寄信、真的擋假信、真的短網址點擊、真的 IG 私訊、真的電子發票上傳。先用這個行業把今天走完，顧問導入時再一項一項接上。
          </p>
        </div>
      </div>
    </ModuleFrame>
  );
}
