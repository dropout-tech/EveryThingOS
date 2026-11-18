import "server-only";
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
    return { rows: await listHeads(await openLedger()), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "測試帳本讀不到" };
  }
}
