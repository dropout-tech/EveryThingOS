import "server-only";
import { type LiveConfig } from "./config";

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: "login" | "denied" | "unreachable" | "upstream",
  ) {
    super(message);
  }
}

export async function erpMethod<T>(_method: string, _args: Record<string, unknown> = {}, _config?: LiveConfig): Promise<T> { throw new SourceError("目前是本機示範", "unreachable"); }
export async function erpPost<T>(_method: string, _args: Record<string, unknown> = {}, _config?: LiveConfig): Promise<T> { throw new SourceError("目前是本機示範", "unreachable"); }
export async function erpFile(_method: string, _args: Record<string, unknown>, _config?: LiveConfig): Promise<Response> { throw new SourceError("目前是本機示範", "unreachable"); }

export function deskUrl(path: string | undefined, config: LiveConfig) {
  if (!path || !config.erpnext) return undefined;
  return `${config.erpnext.url}${path}`;
}
