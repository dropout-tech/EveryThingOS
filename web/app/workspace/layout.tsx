import { OsShell } from "@/components/OsShell";
import { OnboardScreen } from "@/components/OnboardScreen";
import { currentIndustry, currentShop } from "@/lib/workspace";

export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  const shop = await currentShop();
  if (!shop) return <OnboardScreen />;
  const industry = await currentIndustry();
  return (
    <OsShell industry={industry} shop={shop}>
      {children}
    </OsShell>
  );
}
