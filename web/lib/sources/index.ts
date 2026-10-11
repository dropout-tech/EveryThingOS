import "server-only";
import { buildBooks } from "../erp";
import type { IndustryPack } from "../types";
import { demoRecords } from "../workspace";
import { liveConfig } from "./config";
import { SourceError } from "./erpnext";
import { liveBooks, liveDeadLetters, liveLetter, liveMe, livePeople, liveSetup } from "./live";
import type { Books, DeadLetter, LetterOverview, Me, Person, SetupStatus, Sourced, SystemId } from "./types";

export type { Sourced } from "./types";

function failed(system: SystemId, error: unknown): Sourced<never> {
  if (error instanceof SourceError) return { origin: "error", system, message: error.message, kind: error.kind };
  return { origin: "error", system, message: error instanceof Error ? error.message : String(error), kind: "upstream" };
}

export function isLive(system: SystemId) {
  const config = liveConfig();
  return Boolean(system === "erpnext" ? config.erpnext : system === "glue" ? config.glue : config.chatwoot);
}

export async function getSetup(): Promise<Sourced<SetupStatus | null>> {
  if (!isLive("erpnext")) return { origin: "demo", data: null };
  try {
    return { origin: "live", system: "erpnext", data: await liveSetup() };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getDeadLetters(): Promise<Sourced<DeadLetter[]>> {
  if (!isLive("glue")) return { origin: "demo", data: [] };
  try {
    return { origin: "live", system: "glue", data: await liveDeadLetters() };
  } catch (error) {
    return failed("glue", error);
  }
}

export async function getBooks(pack: IndustryPack): Promise<Sourced<Books>> {
  if (!isLive("erpnext")) return { origin: "demo", data: buildBooks(pack) };
  const [setup, dead] = await Promise.all([getSetup(), getDeadLetters()]);
  try {
    const books = await liveBooks(pack, setup.origin === "live" ? setup.data : null, dead.origin === "live" ? dead.data : null);
    return { origin: "live", system: "erpnext", data: books, denied: books.denied, deskUrl: liveConfig().erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getPeople(pack: IndustryPack): Promise<Sourced<Person[]>> {
  if (!isLive("erpnext")) return { origin: "demo", data: demoRecords(pack).leads };
  try {
    return { origin: "live", system: "erpnext", data: await livePeople(), deskUrl: liveConfig().erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getLetter(): Promise<Sourced<LetterOverview | null>> {
  if (!isLive("erpnext")) return { origin: "demo", data: null };
  try {
    return { origin: "live", system: "erpnext", data: await liveLetter(), deskUrl: liveConfig().erpnext?.url };
  } catch (error) {
    return failed("erpnext", error);
  }
}

export async function getMe(): Promise<Sourced<Me | null>> {
  if (!isLive("erpnext")) return { origin: "demo", data: null };
  try {
    return { origin: "live", system: "erpnext", data: await liveMe() };
  } catch (error) {
    return failed("erpnext", error);
  }
}
