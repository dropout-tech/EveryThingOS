import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type BoundStatement = {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

/** The slice of D1 this shell uses. Remote bindings stay off. */
export type AccountDb = {
  prepare(query: string): { bind(...values: unknown[]): BoundStatement };
  batch(statements: BoundStatement[]): Promise<unknown>;
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationPaths = ["0001_accounts.sql", "0002_company_founders.sql"].map((name) => path.join(root, "d1", "migrations", name));

export function accountStatements() {
  return migrationPaths.map((file) => readFileSync(file, "utf8")).join("\n")
    .split(";")
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
}

export async function applyAccountSchema(db: AccountDb) {
  for (const statement of accountStatements()) {
    await db.prepare(statement).bind().run();
  }
}

type Env = { ACCOUNTS: AccountDb };

let opened: Promise<AccountDb> | null = null;

async function proxy(persist: boolean | { path: string }) {
  const { getPlatformProxy } = await import("wrangler");
  return getPlatformProxy<Env>({
    configPath: path.join(root, "wrangler.accounts.jsonc"),
    remoteBindings: false,
    envFiles: [],
    persist,
  });
}

/** The shell's local wrangler D1 (`everythingos-accounts`). Never a remote binding. */
export function accountsDb() {
  opened ??= (async () => {
    const ready = await proxy(true);
    await applyAccountSchema(ready.env.ACCOUNTS);
    return ready.env.ACCOUNTS;
  })();
  return opened;
}

/** A throwaway local D1, for tests. `remoteBindings` is false. */
export async function openAccountsAt(persistPath: string) {
  const ready = await proxy({ path: persistPath });
  await applyAccountSchema(ready.env.ACCOUNTS);
  return { db: ready.env.ACCOUNTS, dispose: () => ready.dispose() };
}
