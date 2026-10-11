import type { Fetch } from "./clients";

export type MeetingLink = { platform: "google_meet" | "zoom" | "teams"; id: string; passcode?: string; url: string };
export type CalendarEvent = { uid: string; summary: string; start: Date; link: MeetingLink | null; attendees: string[] };

const MEET = /https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i;
const ZOOM = /https:\/\/[\w.-]*zoom\.us\/(?:j|w|my)\/(\d{9,11})(?:\?[^\s"<>]*?pwd=([\w.-]+))?/i;
const TEAMS = /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"<>]+/i;

export function findMeetingLink(text: string): MeetingLink | null {
  const meet = text.match(MEET);
  if (meet) return { platform: "google_meet", id: meet[1].toLowerCase(), url: meet[0] };
  const zoom = text.match(ZOOM);
  if (zoom) return { platform: "zoom", id: zoom[1], passcode: zoom[2], url: zoom[0] };
  const teams = text.match(TEAMS);
  if (teams) return { platform: "teams", id: teams[0], url: teams[0] };
  return null;
}

function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeText(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** Wall-clock time in an IANA zone -> UTC Date. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asUtc - guess));
}

export function parseIcsDate(value: string, params: Record<string, string>, fallbackTz = "Asia/Taipei"): Date {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return zonedToUtc(+y, +mo, +d, +h, +mi, +s, params.TZID ?? fallbackTz);
}

type RawEvent = { props: Map<string, { value: string; params: Record<string, string> }[]> };

function parseBlocks(ics: string): RawEvent[] {
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") cur = { props: new Map() };
    else if (line === "END:VEVENT" && cur) {
      events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const [name, ...rawParams] = line.slice(0, idx).split(";");
      const params = Object.fromEntries(rawParams.map((p) => p.split("=") as [string, string]));
      const key = name.toUpperCase();
      const list = cur.props.get(key) ?? [];
      list.push({ value: line.slice(idx + 1), params });
      cur.props.set(key, list);
    }
  }
  return events;
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** DAILY / WEEKLY recurrences (with INTERVAL, BYDAY, UNTIL, COUNT, EXDATE) inside a window. */
function occurrences(start: Date, rrule: string | undefined, exdates: Set<number>, from: Date, to: Date): Date[] {
  if (!rrule) return start >= from && start <= to ? [start] : [];
  const rule = Object.fromEntries(rrule.split(";").map((p) => p.split("=")));
  const interval = Number(rule.INTERVAL ?? 1);
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL, {}, "UTC") : null;
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const byday: number[] = rule.BYDAY ? rule.BYDAY.split(",").map((d: string) => DAYS.indexOf(d.slice(-2))) : [start.getUTCDay()];
  const out: Date[] = [];
  const dayMs = 86400000;
  let n = 0;
  for (let t = start.getTime(); t <= to.getTime() && n < count; t += dayMs) {
    const day = new Date(t);
    const daysSince = Math.floor((t - start.getTime()) / dayMs);
    let hit = false;
    if (rule.FREQ === "DAILY") hit = daysSince % interval === 0;
    else if (rule.FREQ === "WEEKLY") hit = byday.includes(day.getUTCDay()) && Math.floor(daysSince / 7) % interval === 0;
    else return start >= from && start <= to ? [start] : [];
    if (!hit) continue;
    if (until && day > until) break;
    n++;
    if (day >= from && !exdates.has(t)) out.push(day);
  }
  return out;
}

export function eventsInWindow(ics: string, from: Date, to: Date): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const ev of parseBlocks(ics)) {
    const get = (k: string) => ev.props.get(k)?.[0];
    const dt = get("DTSTART");
    if (!dt || (get("STATUS")?.value ?? "").toUpperCase() === "CANCELLED") continue;
    const start = parseIcsDate(dt.value, dt.params);
    const exdates = new Set<number>();
    for (const ex of ev.props.get("EXDATE") ?? []) for (const v of ex.value.split(",")) exdates.add(parseIcsDate(v, ex.params).getTime());
    const text = ["LOCATION", "DESCRIPTION", "URL", "X-GOOGLE-CONFERENCE"].map((k) => unescapeText(get(k)?.value ?? "")).join("\n");
    const attendees = (ev.props.get("ATTENDEE") ?? []).map((a) => a.value.replace(/^mailto:/i, "").toLowerCase());
    for (const when of occurrences(start, get("RRULE")?.value, exdates, from, to)) {
      out.push({ uid: get("UID")?.value ?? "", summary: unescapeText(get("SUMMARY")?.value ?? ""), start: when, link: findMeetingLink(text), attendees });
    }
  }
  return out;
}

export class Vexa {
  constructor(private cfg: { url: string; api_key: string; bot_name?: string }, private fetcher: Fetch) {}

  private headers() {
    return { "X-API-Key": this.cfg.api_key, "Content-Type": "application/json" };
  }

  async requestBot(link: MeetingLink, language = "zh") {
    const res = await this.fetcher(`${this.cfg.url}/bots`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        platform: link.platform,
        native_meeting_id: link.id,
        ...(link.passcode ? { passcode: link.passcode } : {}),
        bot_name: this.cfg.bot_name ?? "會議紀錄",
        language,
      }),
    });
    if (!res.ok && res.status !== 409) throw new Error(`vexa bots ${res.status}: ${await res.text()}`);
    return res.status;
  }

  async transcript(platform: string, id: string): Promise<{ text: string; speakers: string[] }> {
    const res = await this.fetcher(`${this.cfg.url}/transcripts/${platform}/${encodeURIComponent(id)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`vexa transcript ${res.status}`);
    const body = (await res.json()) as { segments?: { speaker?: string; text: string }[] };
    const segs = body.segments ?? [];
    return {
      text: segs.map((s) => (s.speaker ? `${s.speaker}：${s.text}` : s.text)).join("\n"),
      speakers: [...new Set(segs.map((s) => s.speaker).filter(Boolean) as string[])],
    };
  }
}

export const SUMMARY_PROMPT =
  "你是會議紀錄助理。用繁體中文（台灣用語）整理以下逐字稿，固定三段：\n1. 重點（最多五點）\n2. 決定\n3. 待辦（誰、做什麼、何時）\n不要編造逐字稿沒有的內容。";

export type Ai = { run(model: string, input: unknown, options?: unknown): Promise<unknown> };

export async function summarize(ai: Ai, model: string, transcript: string, gateway?: string): Promise<string> {
  const clipped = transcript.length > 24000 ? transcript.slice(0, 12000) + "\n…\n" + transcript.slice(-12000) : transcript;
  const out = (await ai.run(
    model,
    { messages: [{ role: "system", content: SUMMARY_PROMPT }, { role: "user", content: clipped }] },
    gateway ? { gateway: { id: gateway } } : undefined,
  )) as { response?: string };
  return (out.response ?? "").trim();
}
