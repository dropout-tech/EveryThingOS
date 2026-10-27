"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BRANDS, SHOP_NAME_MAX, type BrandId } from "@/lib/brand";
import { Button } from "./ui/Button";

/** Store look and display name. Practice and single-company installs save it here; fleet accounts get it from the consultant. */
export function LookForm({ brand, name, locked }: { brand: BrandId; name: string; locked: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState(brand);
  const [value, setValue] = useState(name);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await fetch("/api/shop/look", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: picked, name: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setNote({ ok: res.ok, text: data.message ?? (res.ok ? "外觀已更新" : "沒有存成功") });
      if (res.ok) router.refresh();
    });
  }

  return (
    <section id="look" className="glass space-y-4 p-5 md:p-6">
      <div>
        <h2 className="font-medium">外觀與店名</h2>
        <p className="mt-1 text-sm text-cream-dim">換的是顏色和字型，頁面、按鈕和數字都一樣。店名會出現在上方和客人的預約頁。</p>
      </div>
      <div>
        <label htmlFor="shop-name" className="field-label">
          店名
        </label>
        <input
          id="shop-name"
          className="field max-w-sm"
          value={value}
          maxLength={SHOP_NAME_MAX}
          placeholder="空白就用公司名稱"
          disabled={locked}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <fieldset>
        <legend className="field-label">外觀</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {BRANDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="choice choice-block gap-2 px-4 py-3"
              aria-pressed={picked === item.id}
              disabled={locked}
              onClick={() => setPicked(item.id)}
            >
              <span data-brand={item.id} className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full border border-[var(--line)] bg-ink" aria-hidden="true" />
                <span className="h-5 w-5 rounded-full bg-teal" aria-hidden="true" />
                <span className="h-5 w-5 rounded-full bg-cream" aria-hidden="true" />
                <span className="text-base">{item.label}</span>
              </span>
              <span className="text-xs font-normal text-cream-dim">{item.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {locked ? (
        <p className="text-sm text-cream-dim">這個帳號的外觀由導入顧問設定，要換請聯絡顧問。</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" pending={pending} pendingLabel="儲存中" onClick={save}>
            儲存外觀
          </Button>
          {note ? (
            <p role="status" className={`text-sm ${note.ok ? "text-ok" : "text-danger"}`}>
              {note.text}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
