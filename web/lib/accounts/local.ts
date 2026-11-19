import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import type { AccountDb } from "./d1.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationPaths = ["0001_accounts.sql", "0002_company_founders.sql", "0003_founder_owner.sql"].map((name) => path.join(root, "d1", "migrations", name));
export function accountStatements() {
  return migrationPaths.map((file) => readFileSync(file, "utf8")).join("\n").split(";").map((part) => part.replace(/--[^\n]*/g, "").trim()).filter(Boolean);
}
export async function openAccountsAt(persistPath: string) {
  const ready = await getPlatformProxy<{ ACCOUNTS: AccountDb }>({ configPath: path.join(root, "wrangler.accounts.jsonc"), remoteBindings: false, envFiles: [], persist: { path: persistPath } });
  for (const statement of accountStatements()) await ready.env.ACCOUNTS.prepare(statement).bind().run();
  return { db: ready.env.ACCOUNTS, dispose: () => ready.dispose() };
}
