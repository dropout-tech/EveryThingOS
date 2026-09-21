"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lens } from "./Lens";
import {
  FEATURES,
  SCENES,
  SIZES,
  defaultsForScene,
  recommendModules,
  type FeatureId,
  type ShopSize,
} from "@/lib/shop";
import { PRICE_NOTE } from "@/lib/commercial";

const STEPS = ["現場", "規模", "功能"] as const;

export function OnboardCard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState("");
  const [size, setSize] = useState<ShopSize | "">("");
  const [picked, setPicked] = useState<FeatureId[]>([]);
  const [pending, start] = useTransition();

  function chooseScene(id: string) {
    setScene(id);
    setPicked(defaultsForScene(id));
    setStep(1);
  }

  function chooseSize(id: ShopSize) {
    setSize(id);
    setPicked(recommendModules(scene, id, defaultsForScene(scene)));
    setStep(2);
  }

  function toggle(id: FeatureId) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submit() {
    if (!scene || !size) return;
    const modules = picked.length ? picked : defaultsForScene(scene);
    start(async () => {
      await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, size, modules }),
      });
      router.push("/workspace");
      router.refresh();
    });
  }

  return (
    <Lens className="w-full" radius={40}>
      <div className="p-8 md:p-10">
        <p className="display text-[11px] tracking-[0.22em] text-cream-dim uppercase">
          {STEPS[step]} · {step + 1}/3
        </p>

        {step === 0 ? (
          <>
            <h1 className="mt-3 text-4xl leading-[1.12] font-medium md:text-5xl">現場像什麼。</h1>
            <p className="mt-3 text-sm text-cream-dim">不是選一百種行業。選現場，功能下一步再勾。</p>
            <ul className="mt-7 flex flex-wrap gap-2">
              {SCENES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => chooseScene(item.id)}
                    className={`glass-chip px-3 py-2 text-sm ${scene === item.id ? "glass-cta text-cream" : ""}`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="mt-3 text-4xl leading-[1.12] font-medium md:text-5xl">幾個人在做事。</h1>
            <p className="mt-3 text-sm text-cream-dim">規模只影響預設打開什麼。之後能改。</p>
            <ul className="mt-7 grid gap-2 sm:grid-cols-2">
              {SIZES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => chooseSize(item.id)}
                    className={`glass-chip w-full px-4 py-3 text-left ${size === item.id ? "glass-cta text-cream" : ""}`}
                  >
                    <span className="block text-base">{item.label}</span>
                    <span className="mt-1 block text-xs text-cream-dim">{item.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-5 text-xs text-cream-dim hover:text-cream" onClick={() => setStep(0)}>
              回上一步
            </button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 className="mt-3 text-4xl leading-[1.12] font-medium md:text-5xl">這些會打開。</h1>
            <p className="mt-3 text-sm text-cream-dim">不要的點掉。沒有要你背模組名。</p>
            <ul className="mt-7 space-y-2">
              {FEATURES.map((item) => {
                const on = picked.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`glass-chip flex w-full items-center justify-between px-4 py-3 text-left ${
                        on ? "text-cream" : "text-cream-dim"
                      }`}
                    >
                      <span>
                        <span className="block text-sm">{item.label}</span>
                        <span className="block text-xs opacity-70">{item.hint}</span>
                      </span>
                      <span className="display text-[11px]">{on ? "開" : "關"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-7 flex items-center justify-between gap-3">
              <button type="button" className="text-xs text-cream-dim hover:text-cream" onClick={() => setStep(1)}>
                回上一步
              </button>
              <button
                type="button"
                disabled={pending || picked.length === 0}
                onClick={submit}
                className="glass-cta rounded-full px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {pending ? "打開中…" : "開始今天"}
              </button>
            </div>
          </>
        ) : null}

        <p className="mt-6 text-xs text-cream-dim">{PRICE_NOTE}</p>
      </div>
    </Lens>
  );
}
