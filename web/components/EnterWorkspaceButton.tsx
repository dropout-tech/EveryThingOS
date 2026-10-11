"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function EnterWorkspaceButton({ industryId, label }: { industryId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="glass-cta rounded-full px-5 py-3 font-medium disabled:opacity-60"
      onClick={() => {
        start(async () => {
          await fetch("/api/industry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: industryId }),
          });
          router.push("/workspace");
          router.refresh();
        });
      }}
    >
      {pending ? "打開中…" : label}
    </button>
  );
}
