"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SCENES, type UiScene } from "@/lib/scene";

export function ScenePicker({ current }: { current: UiScene }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex rounded-full border border-[var(--line)] bg-[var(--glass-fill)] p-0.5 text-xs backdrop-blur-xl" role="group" aria-label="背景風景">
      {SCENES.map((option) => {
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
                document.documentElement.dataset.scene = option.id;
                await fetch("/api/scene", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scene: option.id }),
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
