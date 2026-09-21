import { OsShell } from "@/components/OsShell";
import { PickIndustryScreen } from "@/components/PickIndustryScreen";
import { listIndustryChoices } from "@/lib/industries";
import { currentIndustry, hasChosenIndustry } from "@/lib/workspace";

export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  const chosen = await hasChosenIndustry();
  if (!chosen) {
    return <PickIndustryScreen options={listIndustryChoices()} />;
  }
  const industry = await currentIndustry();
  return <OsShell industry={industry}>{children}</OsShell>;
}
