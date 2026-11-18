import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import type { LedgerDb } from '../ledger/types.ts';
import { create, get, list, complete } from './store.ts';
import { createQuote } from '../ledger/store.ts';
import { priceLines } from '../ledger/money.ts';

test('客人、任務、文件與報價在本機 D1 保持公司隔離', async () => {
 const proxy = await getPlatformProxy<{DB:LedgerDb}>({configPath: 'wrangler.jsonc',remoteBindings:false,persist:false});
 try {
  for (const file of ['migrations/0001_ledger.sql','migrations/0002_workspace.sql']) {
   const sql=readFileSync(file,'utf8').split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
   for (const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await proxy.env.DB.prepare(statement).run();
  }
  const db=proxy.env.DB;
  const customer=await create(db,'a','customers',{name:'客人',phone:'123'}); assert.ok(customer); const id=String(customer.id);
  const priced=priceLines([{itemCode:'服務',qty:1,rate:12000}]); if(!priced.ok) throw Error(priced.error);
  const quote=await createQuote(db,'a',{party:'',partyId:id,partyType:'Customer',priced}); assert.equal(quote.total,12600);
  const row=await db.prepare('SELECT party_id FROM ledger_documents WHERE tenant_id = ?1 AND id = ?2').bind('a',quote.id).first<{party_id:string}>(); assert.equal(row?.party_id,id);
  const task=await create(db,'a','tasks',{title:'聯絡',party_id:id,quote_id:quote.no,assignee:'小明'}); assert.ok(task);
  const doc=await create(db,'a','documents',{title:'紀錄',body:'# 內容',party_id:id}); assert.ok(doc);
  for (const [kind,item] of [['customers',customer],['tasks',task],['documents',doc]] as const) { assert.equal(await get(db,'b',kind,String(item.id)),null); assert.equal((await list(db,'b',kind)).length,0); }
  await assert.rejects(complete(db,'b',String(task.id))); await assert.rejects(create(db,'b','documents',{title:'越權',party_id:id}));
  await complete(db,'a',String(task.id)); assert.equal((await get(db,'a','tasks',String(task.id)))?.completed,1);
 } finally { await proxy.dispose(); }
});
