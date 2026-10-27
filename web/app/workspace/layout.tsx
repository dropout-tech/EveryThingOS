import { redirect } from "next/navigation";
import { GuideProvider } from "@/components/GuideProvider";
import { OsShell } from "@/components/OsShell";
import { OnboardScreen } from "@/components/OnboardScreen";
import { ADMIN_ROLE, canManageTeam, canSeeReports, featuresFor } from "@/lib/access";
import { openInvoice } from "@/lib/billing";
import { guideScope, roleFor } from "@/lib/guide";
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
  if (config.unknownHost) return <Unavailable title="這個網址還沒開通" detail={`${config.unknownHost} 還沒有對應的公司。請確認網址，或聯絡 EveryThingOS 導入顧問。`} />;
  const personal = loginRequired(config);
  if (personal && !(await readSession(config.sessionSecret, config.tenant?.site))) redirect("/login");
  const shop = await currentShop();
  if (!shop) return <OnboardScreen />;
  const industry = await currentIndustry();

  let roles: string[] | null = null;
  let guide = { scope: guideScope(null), role: null as string | null };
  if (personal) {
    const me = await getMe();
    if (me.origin === "error" && me.kind === "login") redirect("/login");
    roles = me.origin === "live" && me.data ? me.data.roles : [];
    if (me.origin === "live" && me.data) guide = { scope: guideScope(me.data.user), role: roleFor(me.data.profile, roles) };
  }
  const life = config.tenant?.lifecycle;
  const invoice = life?.message && roles?.includes(ADMIN_ROLE) ? await openInvoice(config) : null;
  const notice = life?.message ? { message: life.message, urgent: !life.writable || life.stage === "past_due", readOnly: !life.writable, payUrl: invoice?.pay_url } : null;

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
      <GuideProvider scope={guide.scope} role={guide.role}>
        {children}
      </GuideProvider>
    </OsShell>
  );
}
