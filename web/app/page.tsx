import { redirect } from "next/navigation";
import { PickIndustryScreen } from "@/components/PickIndustryScreen";
import { listIndustryChoices } from "@/lib/industries";
import { hasChosenIndustry } from "@/lib/workspace";

export default async function HomePage() {
  if (await hasChosenIndustry()) {
    redirect("/workspace");
  }

  return <PickIndustryScreen options={listIndustryChoices()} />;
}
