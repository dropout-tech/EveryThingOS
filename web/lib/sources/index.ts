import "server-only";
import { buildBooks } from "../erp";
import type { IndustryPack } from "../types";
import { demoRecords } from "../workspace";
import { liveConfig } from "./config";
import { SourceError } from "./erpnext";
import { liveAudit, liveBooks, liveCatalog, liveDeadLetters, liveHygiene, liveLetter, liveMe, liveMeetingSummaries, livePeople, liveSetup, liveTeam, liveUpcomingMeetings, liveWebsite } from "./live";
import type { AuditRow, Books, Catalog, DeadLetter, HygieneRow, LetterOverview, Me, Meetings, Person, SetupStatus, Sourced, SystemId, Team, WebsiteOverview } from "./types";

export type { Sourced } from "./types";

function failed(system: SystemId, error: unknown): Sourced<never> {
  if (error instanceof SourceError) return { origin: "error", system, message: error.message, kind: error.kind };
  return { origin: "error", system, message: error instanceof Error ? error.message : String(error), kind: "upstream" };
}

export async function isLive(system: SystemId) {
  const config = await liveConfig();
  return Boolean(system === "erpnext" ? config.erpnext : system === "glue" ? config.glue : config.chatwoot);
}

export async function getSetup(): Promise<Sourced<SetupStatus | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: null };
  try {
    return { origin: "live", system: "erpnext", data: await liveSetup() };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getDeadLetters(): Promise<Sourced<DeadLetter[]>> {
  if (!(await isLive("glue"))) return { origin: "demo", data: [] };
  try {
    return { origin: "live", system: "glue", data: await liveDeadLetters() };
  } catch (error) {
    return failed("glue", error);
  }
}

export async function getBooks(pack: IndustryPack): Promise<Sourced<Books>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: buildBooks(pack) };
  const [setup, dead] = await Promise.all([getSetup(), getDeadLetters()]);
  try {
    const books = await liveBooks(pack, setup.origin === "live" ? setup.data : null, dead.origin === "live" ? dead.data : null);
    return { origin: "live", system: "erpnext", data: books, denied: books.denied, deskUrl: (await liveConfig()).erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getPeople(pack: IndustryPack): Promise<Sourced<Person[]>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: demoRecords(pack).leads };
  try {
    return { origin: "live", system: "erpnext", data: await livePeople(), deskUrl: (await liveConfig()).erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getLetter(): Promise<Sourced<LetterOverview | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: null };
  try {
    const letter = await liveLetter();
    return { origin: "live", system: "erpnext", data: letter, denied: letter.denied, deskUrl: (await liveConfig()).erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getMe(): Promise<Sourced<Me | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: null };
  try {
    return { origin: "live", system: "erpnext", data: await liveMe() };
  } catch (error) {
    return failed("erpnext", error);
  }
}

/** Items and parties for the live quotation form; null in demo mode. */
export async function getCatalog(): Promise<Catalog | null> {
  if (!(await isLive("erpnext"))) return null;
  try {
    return await liveCatalog();
  } catch {
    return { items: [], parties: [] };
  }
}

export async function getWebsite(): Promise<Sourced<WebsiteOverview | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: null };
  try {
    const site = await liveWebsite();
    return { origin: "live", system: "erpnext", data: site, denied: site.denied, deskUrl: (await liveConfig()).erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

/** Past summaries come from ERPNext, upcoming meetings from the glue's calendar view. Either can be live on its own. */
export async function getMeetings(): Promise<Sourced<Meetings | null>> {
  if (!(await isLive("erpnext")) && !(await isLive("glue"))) return { origin: "demo", data: null };
  const denied: string[] = [];
  let summaries: Meetings["summaries"] = [];
  if (await isLive("erpnext")) {
    try {
      summaries = await liveMeetingSummaries();
    } catch (error) {
      if (error instanceof SourceError && error.kind === "denied") denied.push("會議摘要");
      else return failed("erpnext", error);
    }
  }
  let upcoming: Meetings["upcoming"] = null;
  let bot = false;
  let failedCalendars = 0;
  if (await isLive("glue")) {
    try {
      const u = await liveUpcomingMeetings();
      upcoming = u.meetings;
      bot = u.bot;
      failedCalendars = u.failed;
    } catch (error) {
      return failed("glue", error);
    }
  }
  return { origin: "live", system: (await isLive("erpnext")) ? "erpnext" : "glue", data: { summaries, upcoming, bot, failedCalendars, denied }, denied, deskUrl: (await liveConfig()).erpnext?.url };
}

export async function getHygiene(): Promise<Sourced<HygieneRow[] | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: null };
  try {
    const h = await liveHygiene();
    return { origin: "live", system: "erpnext", data: h.rows, denied: h.denied, deskUrl: (await liveConfig()).erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

/** People and permissions; null in practice mode, where the page shows a sample team. */
export async function getTeam(): Promise<Sourced<Team | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: null };
  try {
    return { origin: "live", system: "erpnext", data: await liveTeam(), deskUrl: (await liveConfig()).erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getAudit(): Promise<Sourced<AuditRow[]>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: [] };
  try {
    return { origin: "live", system: "erpnext", data: await liveAudit() };
  } catch (error) {
    return failed("erpnext", error);
  }
}
