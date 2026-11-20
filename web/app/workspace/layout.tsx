import { redirect } from "next/navigation";
import { GuideProvider } from "@/components/GuideProvider";
import { OsShell } from "@/components/OsShell";
import { OnboardScreen } from "@/components/OnboardScreen";
import { ADMIN_ROLE, canManageTeam, canSeeReports, featuresFor } from "@/lib/access";
import { showAgent } from "@/lib/agent-tier";
import { openInvoice } from "@/lib/billing";
import { guideScope, roleFor } from "@/lib/guide";
import { getMe } from "@/lib/sources";
import { liveConfig } from "@/lib/sources/config";
import { withoutRetiredDemoModules } from "@/lib/retired-demo";
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
  if (config.unknownHost) return <Unavailable title="這個網址還沒開通" detail={`${config.unknownHost} 還沒有對應的公司。請確認網址，或聯絡 EveryThingOS 導入顧問。`} />;
  const shop = await currentShop();
  if (!shop) return <OnboardScreen />;
  const industry = await currentIndustry();

  const me = await getMe();
  if (me.origin === "error" && me.kind === "login") redirect("/login");
  if (me.origin === "error") return <Unavailable title="帳號庫讀不到" detail={me.message} />;
  let roles: string[] | null = null;
  let guide = { scope: guideScope(null), role: null as string | null };
  const signedIn = me.origin === "live" && Boolean(me.data);
  if (signedIn && me.data) {
    roles = me.data.roles;
    guide = { scope: guideScope(me.data.user), role: roleFor(me.data.profile, roles) };
  }
  const life = config.tenant?.lifecycle;
  const invoice = life?.message && roles?.includes(ADMIN_ROLE) ? await openInvoice(config) : null;
  const notice = life?.message ? { message: life.message, urgent: !life.writable || life.stage === "past_due", readOnly: !life.writable, payUrl: invoice?.pay_url } : null;

  return (
    <OsShell
      industry={industry}
      shop={{ ...shop, modules: featuresFor(withoutRetiredDemoModules(shop.modules), roles) }}
      company={config.tenant?.company}
      team={canManageTeam(roles)}
      reports={canSeeReports(roles)}
      notice={notice}
      canReset={!config.tenant?.profile}
      agent={showAgent(shop.agent) && (config.tenant ? config.tenant.ai : true)}
      signedIn={signedIn}
    >
      <GuideProvider scope={guide.scope} role={guide.role}>
        {children}
      </GuideProvider>
    </OsShell>
  );
}
