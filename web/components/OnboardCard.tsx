"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/Button";
import { listIndustries } from "@/lib/industries";
import {
  FEATURES,
  SCENES,
  SIZES,
  defaultsForScene,
  recommendModules,
  sceneFromGroup,
  type FeatureId,
  type ShopSize,
} from "@/lib/shop";
import { PRICE_NOTE } from "@/lib/commercial";

const STEPS = ["現場", "這一家", "規模", "功能"] as const;

export function OnboardCard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState<ShopSize | "">("");
  const [picked, setPicked] = useState<FeatureId[]>([]);
  const [pending, start] = useTransition();

  function chooseScene(id: string) {
    setScene(id);
    setIndustry("");
    setPicked(defaultsForScene(id));
    setStep(1);
  }

  function chooseIndustry(id: string) {
    setIndustry(id);
    setStep(2);
  }

  function chooseSize(id: ShopSize) {
    setSize(id);
    setPicked(recommendModules(scene, id, defaultsForScene(scene)));
    setStep(3);
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
        body: JSON.stringify({ scene, size, modules, industry, customModules: true }),
      });
      router.push("/workspace");
      router.refresh();
    });
  }

  return (
    <article className="paper-card w-full px-6 py-8 md:px-10 md:py-10">
        <p className="text-xs text-cream-dim">
          {STEPS[step]} · {step + 1}/4
        </p>

        {step === 0 ? (
          <>
            <h1 className="mt-3 text-4xl leading-[1.12] font-medium md:text-5xl">現場像什麼。</h1>
            <p className="mt-3 text-sm text-cream-dim">先選現場，下一步選這一家。花店不會被鎖成服飾店。</p>
            <ul className="mt-7 flex flex-wrap gap-2">
              {SCENES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => chooseScene(item.id)}
                    className="choice px-3 py-2 text-sm"
                    aria-pressed={scene === item.id}
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
            <h1 className="mt-3 text-4xl leading-[1.12] font-medium md:text-5xl">這一家做什麼。</h1>
            <p className="mt-3 text-sm text-cream-dim">同一種現場裡，每一家的貨和單不共用。</p>
            <ul className="mt-7 flex max-h-80 flex-wrap gap-2 overflow-auto">
              {listIndustries()
                .filter((item) => sceneFromGroup(item.group).id === scene)
                .map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => chooseIndustry(item.id)} className="choice px-3 py-2 text-sm" aria-pressed={industry === item.id}>
                      {item.nameZh}
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
            <h1 className="mt-3 text-4xl leading-[1.12] font-medium md:text-5xl">幾個人在做事。</h1>
            <p className="mt-3 text-sm text-cream-dim">就我一個仍保留預約。官網先關。人數變多不會自動塞進同一套假單。</p>
            <ul className="mt-7 grid gap-2 sm:grid-cols-2">
              {SIZES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => chooseSize(item.id)}
                    className="choice choice-block w-full px-4 py-3 text-left"
                    aria-pressed={size === item.id}
                  >
                    <span className="block text-base">{item.label}</span>
                    <span className="mt-1 block text-xs text-cream-dim">{item.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-5 text-xs text-cream-dim hover:text-cream" onClick={() => setStep(1)}>
              回上一步
            </button>
          </>
        ) : null}

        {step === 3 ? (
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
                      className="choice choice-row px-4 py-2.5 text-sm"
                      aria-pressed={on}
                    >
                      <span>{item.label}</span>
                      <span className="display text-[11px]">{on ? "開" : "關"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-7 flex items-center justify-between gap-3">
              <button type="button" className="text-xs text-cream-dim hover:text-cream" onClick={() => setStep(2)}>
                回上一步
              </button>
              <Button variant="primary" disabled={pending || picked.length === 0} pending={pending} pendingLabel="打開中…" onClick={submit}>
                開始今天
              </Button>
            </div>
          </>
        ) : null}

        <p className="mt-6 text-xs text-cream-dim">{PRICE_NOTE}</p>
    </article>
  );
}
