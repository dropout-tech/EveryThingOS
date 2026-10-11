"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { syncThemeColor } from "@/lib/style";
import type { UiTheme } from "@/lib/theme";

const options: { id: UiTheme; label: string; name: string }[] = [
  { id: "black", label: "黑", name: "深色" },
  { id: "white", label: "白", name: "淺色" },
];

export function ThemeToggle({ current }: { current: UiTheme }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="theme-toggle" role="group" aria-label="介面顏色">
      {options.map((option) => {
        const active = current === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={pending}
            aria-pressed={active}
            aria-label={option.name}
            title={option.name}
            className="min-h-8 min-w-9 rounded-full px-2.5"
            onClick={() => {
              if (active) return;
              start(async () => {
                document.documentElement.dataset.theme = option.id;
                syncThemeColor();
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
