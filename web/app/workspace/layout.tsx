import { redirect } from "next/navigation";
import { OsShell } from "@/components/OsShell";
import { OnboardScreen } from "@/components/OnboardScreen";
import { readSession } from "@/lib/session";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { currentIndustry, currentShop } from "@/lib/workspace";

export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  const config = liveConfig();
  if (loginRequired(config) && !(await readSession(config.sessionSecret))) redirect("/login");
  const shop = await currentShop();
  if (!shop) return <OnboardScreen />;
  const industry = await currentIndustry();
  return (
    <OsShell industry={industry} shop={shop}>
      {children}
    </OsShell>
  );
}
