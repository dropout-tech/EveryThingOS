import { OsShell } from "@/components/OsShell";
import { currentIndustry } from "@/lib/workspace";

export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  const industry = await currentIndustry();
  return <OsShell industry={industry}>{children}</OsShell>;
}
