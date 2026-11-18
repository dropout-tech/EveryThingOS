import "server-only";
import { readActor } from "../accounts/guard";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { LedgerUnavailable } from "./errors";
import { listHeads } from "./store";
import type { LedgerDb, LedgerHead } from "./types";

export async function openLedger(): Promise<LedgerDb> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as { DB?: LedgerDb }).DB;
    if (!db) throw new LedgerUnavailable();
    const ready = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ledger_documents'").first<{ name: string }>();
    if (!ready) throw new LedgerUnavailable();
    return db;
  } catch (error) {
    if (error instanceof LedgerUnavailable) throw error;
    throw new LedgerUnavailable();
  }
}

export async function readLedger(): Promise<{ rows: LedgerHead[]; error: string | null }> {
  try {
    const actor = await readActor();
    if (actor.status !== "ok") return { rows: [], error: actor.status === "error" ? actor.message : null };
    return { rows: await listHeads(await openLedger(), actor.account.companyId), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "測試帳本讀不到" };
  }
}
