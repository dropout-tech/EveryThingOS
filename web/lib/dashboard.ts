/** Cards on the owner dashboard. Each one reads a section of `OwnerReport`; none adds its own data source. */
export type WidgetId =
  | "kpiRevenue"
  | "kpiPeriod"
  | "kpiMargin"
  | "kpiReceivable"
  | "revenue"
  | "margin"
  | "aging"
  | "topCustomers"
  | "pipeline"
  | "lowStock";

/** kpi = one column of four, half = two, full = the whole row. */
export type WidgetSize = "kpi" | "half" | "full";

export const WIDGETS: { id: WidgetId; label: string; size: WidgetSize }[] = [
  { id: "kpiRevenue", label: "本月營收", size: "kpi" },
  { id: "kpiPeriod", label: "期間營收", size: "kpi" },
  { id: "kpiMargin", label: "本月毛利率", size: "kpi" },
  { id: "kpiReceivable", label: "還沒收到的錢", size: "kpi" },
  { id: "revenue", label: "每月營收", size: "half" },
  { id: "margin", label: "毛利率走勢", size: "half" },
  { id: "aging", label: "帳齡", size: "full" },
  { id: "topCustomers", label: "前十大客人", size: "half" },
  { id: "pipeline", label: "從詢問到成交", size: "half" },
  { id: "lowStock", label: "快不夠的貨", size: "full" },
];

export const DEFAULT_LAYOUT: WidgetId[] = ["kpiRevenue", "kpiPeriod", "kpiMargin", "kpiReceivable", "revenue", "topCustomers", "aging", "lowStock"];

const KNOWN = new Set<string>(WIDGETS.map((w) => w.id));

export function widgetSize(id: WidgetId): WidgetSize {
  return WIDGETS.find((w) => w.id === id)?.size ?? "half";
}

export function widgetLabel(id: WidgetId): string {
  return WIDGETS.find((w) => w.id === id)?.label ?? id;
}

/**
 * Reads what this person saved. Unknown ids (a card we removed later) and duplicates are dropped.
 * Anything unreadable falls back to the default. An empty list is kept: the person chose it.
 */
export function parseLayout(raw: string | null | undefined): WidgetId[] {
  if (!raw) return [...DEFAULT_LAYOUT];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [...DEFAULT_LAYOUT];
  }
  if (!Array.isArray(value)) return [...DEFAULT_LAYOUT];
  const seen = new Set<string>();
  const ids: WidgetId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !KNOWN.has(item) || seen.has(item)) continue;
    seen.add(item);
    ids.push(item as WidgetId);
  }
  return ids;
}

export function hiddenWidgets(layout: WidgetId[]): WidgetId[] {
  return WIDGETS.map((w) => w.id).filter((id) => !layout.includes(id));
}

export function moveWidget(layout: WidgetId[], id: WidgetId, step: -1 | 1): WidgetId[] {
  const from = layout.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function removeWidget(layout: WidgetId[], id: WidgetId): WidgetId[] {
  return layout.filter((item) => item !== id);
}

export function addWidget(layout: WidgetId[], id: WidgetId): WidgetId[] {
  return layout.includes(id) || !KNOWN.has(id) ? layout : [...layout, id];
}

export function isDefaultLayout(layout: WidgetId[]): boolean {
  return layout.length === DEFAULT_LAYOUT.length && layout.every((id, i) => id === DEFAULT_LAYOUT[i]);
}
