"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { UiTheme } from "@/lib/theme";

const options: { id: UiTheme; label: string }[] = [
  { id: "black", label: "黑" },
  { id: "white", label: "白" },
];

export function ThemeToggle({ current }: { current: UiTheme }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex rounded-full bg-white/10 p-0.5 text-xs" role="group" aria-label="介面顏色">
      {options.map((option) => {
        const active = current === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={pending}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 ${active ? "bg-teal text-ink" : "text-cream-dim hover:text-cream"}`}
            onClick={() => {
              if (active) return;
              start(async () => {
                document.documentElement.dataset.theme = option.id;
                await fetch("/api/theme", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ theme: option.id }),
                });
                router.refresh();
              });
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
