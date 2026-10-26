"use client";

import { useRef, useState, type ReactNode } from "react";
import { buttonClass } from "./ui/Button";
import { useGuideValue } from "@/lib/guide-state";
import {
  addWidget,
  DEFAULT_LAYOUT,
  hiddenWidgets,
  isDefaultLayout,
  moveWidget,
  parseLayout,
  removeWidget,
  widgetLabel,
  widgetSize,
  type WidgetId,
} from "@/lib/dashboard";

const SPAN = { kpi: "dash-kpi", half: "dash-half", full: "dash-full" } as const;

/** Lays out the cards the server already rendered. The order is remembered per person on this device. */
export function Dashboard({ tiles, toolbar }: { tiles: Record<WidgetId, ReactNode>; toolbar?: ReactNode }) {
  const saved = useGuideValue("dashboard-layout");
  const [editing, setEditing] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const layout = saved.ready ? parseLayout(saved.value) : DEFAULT_LAYOUT;
  const save = (next: WidgetId[]) => saved.set(isDefaultLayout(next) ? null : JSON.stringify(next));
  const hidden = hiddenWidgets(layout);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">{toolbar}</div>
        <button ref={toggle} type="button" className={buttonClass({ variant: "secondary", size: "sm" })} aria-pressed={editing} onClick={() => setEditing((on) => !on)}>
          {editing ? "完成" : "自訂儀表板"}
        </button>
      </div>

      {editing ? (
        <section className="dash-card dash-editor space-y-3" aria-label="自訂儀表板">
          <p className="text-sm text-cream-dim">用箭頭排順序，拿掉不想看的卡片。只記在這台電腦，不影響同事。</p>
          {hidden.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-cream-dim">加入：</span>
              {hidden.map((id) => (
                <button key={id} type="button" className="dash-chip" onClick={() => save(addWidget(layout, id))}>
                  + {widgetLabel(id)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-cream-dim">所有卡片都在上面了。</p>
          )}
          {!isDefaultLayout(layout) ? (
            <button type="button" className="text-sm text-cream-dim underline underline-offset-4 hover:text-cream" onClick={() => saved.set(null)}>
              恢復預設
            </button>
          ) : null}
        </section>
      ) : null}

      {layout.length ? (
        <div className="dash-grid">
          {layout.map((id, i) => (
            <div key={id} className={`${SPAN[widgetSize(id)]} relative`}>
              {editing ? (
                <div className="dash-tools" role="group" aria-label={widgetLabel(id)}>
                  <button type="button" aria-label={`${widgetLabel(id)} 往前`} disabled={i === 0} onClick={() => save(moveWidget(layout, id, -1))}>
                    ↑
                  </button>
                  <button type="button" aria-label={`${widgetLabel(id)} 往後`} disabled={i === layout.length - 1} onClick={() => save(moveWidget(layout, id, 1))}>
                    ↓
                  </button>
                  <button type="button" aria-label={`拿掉 ${widgetLabel(id)}`} onClick={() => {
                      save(removeWidget(layout, id));
                      toggle.current?.focus();
                    }}>
                    ×
                  </button>
                </div>
              ) : null}
              {tiles[id]}
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-card text-sm text-cream-dim">卡片都拿掉了。按「自訂儀表板」加回來。</p>
      )}
    </div>
  );
}
