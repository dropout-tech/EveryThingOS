import { redirect } from "next/navigation";
import { OnboardScreen } from "@/components/OnboardScreen";
import { hasChosenIndustry } from "@/lib/workspace";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const setup = (await searchParams).setup;
  if ((await hasChosenIndustry()) && setup !== "1") {
    redirect("/workspace");
  }
  return <OnboardScreen />;
}
