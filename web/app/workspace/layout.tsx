import { redirect } from "next/navigation";
import { OsShell } from "@/components/OsShell";
import { OnboardScreen } from "@/components/OnboardScreen";
import { canManageTeam, canSeeReports, featuresFor } from "@/lib/access";
import { readSession } from "@/lib/session";
import { getMe } from "@/lib/sources";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { currentIndustry, currentShop } from "@/lib/workspace";

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-6 text-cream">
      <h1 className="text-xl">{title}</h1>
      <p className="text-cream-dim">{detail}</p>
    </main>
  );
}

export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  const config = await liveConfig();
  if (config.directoryError) return <Unavailable title="暫時連不上" detail={`${config.directoryError}。資料都在，請過幾分鐘再開。`} />;
  if (config.unknownHost) return <Unavailable title="這個網址還沒開通" detail={`${config.unknownHost} 還沒有對應的公司。請確認網址，或聯絡 DropOut OS 導入顧問。`} />;
  const personal = loginRequired(config);
  if (personal && !(await readSession(config.sessionSecret, config.tenant?.site))) redirect("/login");
  const shop = await currentShop();
  if (!shop) return <OnboardScreen />;
  const industry = await currentIndustry();

  let roles: string[] | null = null;
  if (personal) {
    const me = await getMe();
    if (me.origin === "error" && me.kind === "login") redirect("/login");
    roles = me.origin === "live" && me.data ? me.data.roles : [];
  }
  const life = config.tenant?.lifecycle;
  const notice = life?.message ? { message: life.message, urgent: !life.writable || life.stage === "past_due" } : null;

  return (
    <OsShell
      industry={industry}
      shop={{ ...shop, modules: featuresFor(shop.modules, roles) }}
      company={config.tenant?.company}
      team={canManageTeam(roles)}
      reports={canSeeReports(roles)}
      notice={notice}
      canReset={!config.tenant?.profile}
    >
      {children}
    </OsShell>
  );
}
