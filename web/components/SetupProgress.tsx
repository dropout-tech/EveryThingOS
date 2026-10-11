import type { SetupStatus } from "@/lib/sources/types";

/** Every step is derived from records in ERPNext, so it cannot be ticked by hand. */
export function SetupProgress({ setup }: { setup: SetupStatus }) {
  return (
    <section id="setup" className="glass-well space-y-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">導入進度</h2>
        <p className="display text-sm">
          {setup.done}／{setup.total}
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {setup.steps.map((step) => (
          <li key={step.id} className={`flex items-center gap-2 text-sm ${step.done ? "" : "text-cream-dim"}`}>
            <span aria-hidden>{step.done ? "●" : "○"}</span>
            <span>{step.label}</span>
            {step.id === "checks" && setup.issues ? <span className="text-xs text-warn">{setup.issues} 個問題</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
