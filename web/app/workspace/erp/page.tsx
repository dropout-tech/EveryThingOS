import { redirect } from "next/navigation";
import { currentShop } from "@/lib/workspace";
import { moduleHref } from "@/lib/shop";

export const metadata = { title: "生意" };

export default async function ErpHubPage() {
  const shop = await currentShop();
  if (shop?.modules.includes("sales")) redirect(moduleHref("sales"));
  if (shop?.modules.includes("finance")) redirect(moduleHref("finance"));
  if (shop?.modules.includes("stock")) redirect(moduleHref("stock"));
  if (shop?.modules.includes("purchase")) redirect(moduleHref("purchase"));
  redirect("/workspace");
}
