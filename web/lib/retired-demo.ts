import type { FeatureId } from "./shop";
import { moduleHref } from "./shop";

/** 僅示範假資料的模組；正式站不開放入口與路由。 */
export const RETIRED_DEMO_MODULES = ["hr", "chat", "letter"] as const satisfies readonly FeatureId[];

export function withoutRetiredDemoModules(modules: FeatureId[]): FeatureId[] {
  const hidden = new Set<FeatureId>(RETIRED_DEMO_MODULES);
  return modules.filter((id) => !hidden.has(id));
}

export function isRetiredDemoHref(href: string): boolean {
  return RETIRED_DEMO_MODULES.some((id) => {
    const base = moduleHref(id);
    return href === base || href.startsWith(`${base}/`);
  });
}

/** 示範 API；關閉回應但仍保留 route 檔。 */
export const RETIRED_DEMO_API_PATHS = [
  "/api/hr/checkin",
  "/api/hr/leave",
  "/api/hr/overtime",
  "/api/hr/schedule",
  "/api/letter/newsletter",
  "/api/letter/send",
  "/api/chat/open",
] as const;

export function isRetiredDemoApiPath(pathname: string): boolean {
  return RETIRED_DEMO_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** 導覽或指南裡不應再連到下架頁。 */
export function remapRetiredWorkspaceHref(href: string): string {
  if (isRetiredDemoHref(href)) return "/workspace";
  return href;
}