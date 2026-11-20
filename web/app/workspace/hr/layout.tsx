import type { ReactNode } from "react";

/** 路由在 next.config 層就 3xx，此 layout 僅保留檔案結構。 */
export default function HrLayout({ children }: { children: ReactNode }) {
  return children;
}