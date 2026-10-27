"use client";

import { demoKey, useDemoState } from "@/lib/demo-state";
import type { TradeFact } from "@/lib/trade";

/** Fields this trade actually keeps. Values stay on this browser until a live record exists. */
export function TradeDesk({ packId, facts }: { packId: string; facts: TradeFact[] }) {
  const [values, setValues] = useDemoState<Record<string, string>>(demoKey("facts", packId), {});
  if (!facts.length) return null;
  return (
    <section className="glass p-5">
      <h2 className="text-sm font-medium">這家要記的</h2>
      <ul className="mt-3 space-y-3">
        {facts.map((fact) => (
          <li key={fact.id}>
            <label className="block text-sm">
              {fact.label}
              <span className="mt-1 block text-xs text-cream-dim">{fact.hint}</span>
              <input
                value={values[fact.id] ?? ""}
                onChange={(event) => setValues({ ...values, [fact.id]: event.target.value })}
                className="field mt-1"
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
