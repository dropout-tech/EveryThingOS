/** 右側代理先把文件提案掛著。員工確認同一筆之後才算接受，否則不寫文件。 */

export type Proposal = { id: string; tool: string; summary: string };

export function stage(current: Proposal | null, next: Proposal): Proposal {
  void current;
  return next;
}

export function confirm(
  current: Proposal | null,
  id: string,
): { pending: Proposal | null; accepted: Proposal | null } {
  if (current && current.id === id) {
    return { pending: null, accepted: current };
  }
  return { pending: current, accepted: null };
}

export function dismiss(current: Proposal | null): null {
  void current;
  return null;
}
