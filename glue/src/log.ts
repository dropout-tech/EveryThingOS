/** One JSON object per line, so Workers Logs can filter on `level`, `event` and `site`. Never pass secrets in `fields`. */
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ...fields, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
