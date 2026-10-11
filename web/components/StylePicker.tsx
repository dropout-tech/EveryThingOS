"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { STYLES, syncThemeColor, type UiStyle } from "@/lib/style";

export function StylePicker({ current, variant = "compact" }: { current: UiStyle; variant?: "compact" | "cards" }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(id: UiStyle) {
    if (id === current) return;
    start(async () => {
      document.documentElement.dataset.style = id;
      syncThemeColor();
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: id }),
      });
      router.refresh();
    });
  }

  if (variant === "cards") {
    return (
      <div className="style-picker-cards grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="介面風格">
        {STYLES.map((style) => {
          const active = current === style.id;
          return (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              data-style-option={style.id}
              className="style-card text-left"
              onClick={() => choose(style.id)}
            >
              <span className="style-card-swatch" aria-hidden="true" />
              <span className="block font-medium">{style.name}</span>
              <span className="mt-1 block text-sm text-cream-dim">{style.note}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <label className="style-picker inline-flex items-center gap-2 text-xs text-cream-dim">
      <span className="sr-only sm:not-sr-only">風格</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => choose(e.target.value as UiStyle)}
        className="min-h-8 rounded-full border border-[var(--line)] bg-transparent px-2.5 text-xs text-cream"
      >
        {STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            {style.name}
          </option>
        ))}
      </select>
    </label>
  );
}
