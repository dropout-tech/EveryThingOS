"use client";

import type { ReactNode } from "react";
import { GuideScope } from "@/lib/guide-state";

export function GuideProvider({ scope, role, children }: { scope: string; role: string | null; children: ReactNode }) {
  return <GuideScope.Provider value={{ scope, role }}>{children}</GuideScope.Provider>;
}
