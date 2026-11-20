import "server-only";
import { canManageTeam, canSeeReports, featuresFor } from "./access";
import { buildBooks } from "./erp";
import { checklistFor, resolveChecklist, type ChecklistItem } from "./guide";
import { hrefAllowed, navItemsForShop } from "./shop";
import { getChecklist, getMe } from "./sources";
import type { IndustryPack } from "./types";
import { currentShop } from "./workspace";

export type WorkspaceGuide = {
  /** Menu hrefs this person has, so guides never link to a page they cannot open. */
  allowed: string[];
  /** null: not the owner, or the site's dropout_core is older than the checklist. */
  checklist: ChecklistItem[] | null;
  practice?: { packId: string; seed: ReturnType<typeof buildBooks>["sales"] };
};

export async function workspaceGuide(pack: IndustryPack): Promise<WorkspaceGuide> {
  const shop = await currentShop();
  const me = await getMe();
  const roles = me.origin === "live" && me.data ? me.data.roles : null;
  const modules = featuresFor(shop?.modules ?? [], roles);
  const shopProfile = { scene: shop?.scene ?? "other", size: shop?.size ?? "small", modules };
  const allowed = navItemsForShop(shopProfile, { team: canManageTeam(roles), reports: canSeeReports(roles) })
    .map((item) => item.href)
    .filter((href) => hrefAllowed(href, shopProfile));
  const steps = checklistFor(shop);

  const live = await getChecklist();
  if (live.origin === "demo") {
    return { allowed, checklist: resolveChecklist(steps, null), practice: { packId: pack.id, seed: buildBooks(pack).sales } };
  }
  if (live.origin === "error" || !live.data) return { allowed, checklist: null };
  return { allowed, checklist: resolveChecklist(steps, live.data.steps, live.deskUrl) };
}
