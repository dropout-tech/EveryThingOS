import type { LedgerDb } from '../ledger/types';
import { LedgerError } from '../ledger/errors';

export type Kind = 'customers' | 'tasks' | 'documents';
const tables: Record<Kind, string> = { customers: 'ledger_parties', tasks: 'workspace_tasks', documents: 'workspace_docs' };
const fields: Record<Kind, string> = { customers: 'id, name, party_type, created_at, phone, email, notes', tasks: 'id, title, assignee, completed, party_id, quote_id, created_at', documents: 'id, title, body, party_id, created_at' };
export function kindOf(value: string): Kind | null { return Object.hasOwn(tables, value) ? value as Kind : null; }
const clean = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export async function list(db: LedgerDb, tenant: string, kind: Kind) {
  return (await db.prepare(`SELECT ${fields[kind]} FROM ${tables[kind]} WHERE tenant_id = ?1 ORDER BY created_at DESC`).bind(tenant).all<Record<string, unknown>>()).results;
}
export async function get(db: LedgerDb, tenant: string, kind: Kind, id: string) {
  return db.prepare(`SELECT ${fields[kind]} FROM ${tables[kind]} WHERE tenant_id = ?1 AND id = ?2`).bind(tenant, id).first<Record<string, unknown>>();
}
export async function create(db: LedgerDb, tenant: string, kind: Kind, input: Record<string, unknown>) {
  const id = crypto.randomUUID(), stamp = new Date().toISOString();
  const title = clean(kind === 'customers' ? input.name : input.title, 100);
  if (!title) throw new LedgerError(kind === 'customers' ? '請填姓名' : '請填標題');
  const party = clean(input.party_id, 100) || null, quote = clean(input.quote_id, 100) || null;
  if (party && !await get(db, tenant, 'customers', party)) throw new LedgerError('找不到客人', 404);
  if (quote && !await db.prepare('SELECT id FROM ledger_documents WHERE tenant_id = ?1 AND chain_id = ?2').bind(tenant, quote).first()) throw new LedgerError('找不到報價', 404);
  if (kind === 'customers') await db.prepare("INSERT INTO ledger_parties (tenant_id,id,name,party_type,created_at,phone,email,notes) VALUES (?1,?2,?3,'Customer',?4,?5,?6,?7)").bind(tenant,id,title,stamp,clean(input.phone,100),clean(input.email,200),clean(input.notes,4000)).run();
  if (kind === 'tasks') await db.prepare('INSERT INTO workspace_tasks (tenant_id,id,title,assignee,party_id,quote_id,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(tenant,id,title,clean(input.assignee,100),party,quote,stamp).run();
  if (kind === 'documents') await db.prepare('INSERT INTO workspace_docs (tenant_id,id,title,body,party_id,created_at) VALUES (?1,?2,?3,?4,?5,?6)').bind(tenant,id,title,clean(input.body,50000),party,stamp).run();
  return get(db, tenant, kind, id);
}
export async function complete(db: LedgerDb, tenant: string, id: string) {
  const r = await db.prepare('UPDATE workspace_tasks SET completed = 1 WHERE tenant_id = ?1 AND id = ?2').bind(tenant,id).run();
  if (!r.meta?.changes) throw new LedgerError('找不到任務',404);
  return get(db, tenant, 'tasks', id);
}
