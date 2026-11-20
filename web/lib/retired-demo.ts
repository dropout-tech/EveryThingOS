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