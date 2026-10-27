import { readFileSync, writeFileSync } from "node:fs";
import type { Hold } from "./holds";

/**
 * Practice seats live on the server, keyed by industry, so a second browser
 * sees the same remaining seats. The cookie is only a copy for this browser.
 */
const FILE = "/tmp/dropout-practice-ledger.json";

type FileShape = { holds: Record<string, Hold[]> };

function read(): FileShape {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as FileShape;
    return parsed?.holds ? parsed : { holds: {} };
  } catch {
    return { holds: {} };
  }
}

function write(data: FileShape) {
  writeFileSync(FILE, JSON.stringify(data));
}

export function ledgerHolds(industryId: string): Hold[] {
  return read().holds[industryId] ?? [];
}

export function saveLedgerHolds(industryId: string, holds: readonly Hold[]) {
  const data = read();
  data.holds[industryId] = holds.slice(-40);
  write(data);
}

export function clearLedgerHolds(industryId: string) {
  const data = read();
  delete data.holds[industryId];
  write(data);
}

export function mergeHolds(cookieHolds: readonly Hold[], serverHolds: readonly Hold[]): Hold[] {
  const byId = new Map<string, Hold>();
  for (const hold of cookieHolds) byId.set(hold.id, hold);
  for (const hold of serverHolds) byId.set(hold.id, hold);
  return [...byId.values()].slice(-40);
}
