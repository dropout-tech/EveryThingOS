import { getCloudflareContext } from "@opennextjs/cloudflare";

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

/** Use the configured D1 binding in both the Worker and local Next dev. */
export async function accountsDb(): Promise<AccountDb> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as { ACCOUNTS?: AccountDb }).ACCOUNTS;
  if (!db) throw new Error("帳號資料庫未設定");
  return db;
}
