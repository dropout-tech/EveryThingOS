/** One beat a Taiwan shop actually does. Practice walks these one click at a time. */

export const BEAT_HREFS = [
  "/workspace/crm",
  "/workspace/erp/sales",
  "/workspace/erp/stock",
  "/workspace/erp/purchase",
  "/workspace/erp/finance",
  "/workspace/letter",
  "/workspace/chat",
] as const;

export type BeatHref = (typeof BEAT_HREFS)[number];

export type SceneBeat = {
  /** 2–6 Traditional Chinese characters. Unique inside one scene. */
  step: string;
  /** One sentence the owner would say out loud. No tax rates, no government file formats. */
  detail: string;
  href: BeatHref;
};

export type SceneScript = {
  id: string;
  label: string;
  beats: readonly [SceneBeat, SceneBeat, SceneBeat, SceneBeat, SceneBeat, SceneBeat, SceneBeat, SceneBeat, SceneBeat, SceneBeat];
};
