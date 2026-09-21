"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { IndustryPack } from "@/lib/types";

type IndustrySwitcherProps = {
  current: IndustryPack;
  options: IndustryPack[];
};

export function IndustrySwitcher({ current, options }: IndustrySwitcherProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-cream-dim">
      <span className="shrink-0">產業包</span>
      <select
        key={current.id}
        className="glass-chip max-w-[16rem] truncate rounded-full border-0 px-3 py-1.5 text-cream"
        defaultValue={current.id}
        disabled={pending}
        onChange={(event) => {
          const id = event.target.value;
          start(async () => {
            await fetch("/api/industry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });
            router.refresh();
          });
        }}
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.code} {item.nameZh}
          </option>
        ))}
      </select>
    </label>
  );
}
