import { readActor } from '@/lib/accounts/guard';
import { sameOrigin, readJson, refuse } from '@/lib/actions';
import { openLedger } from '@/lib/ledger/read';
import { LedgerError } from '@/lib/ledger/errors';
import { create, kindOf, list } from '@/lib/workspace-data/store';
import { NextResponse, type NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(_r: NextRequest, { params }: { params: Promise<{kind:string}> }) {
 const actor = await readActor(); if (actor.status !== 'ok') return refuse('請先登入',401);
 const kind = kindOf((await params).kind); if (!kind) return refuse('找不到',404);
 return NextResponse.json({items: await list(await openLedger(), actor.account.companyId, kind)});
}
export async function POST(r: NextRequest, { params }: { params: Promise<{kind:string}> }) {
 if (!sameOrigin(r)) return refuse('來源不符',403);
 const actor = await readActor(); if (actor.status !== 'ok') return refuse('請先登入',401);
 const kind = kindOf((await params).kind); if (!kind) return refuse('找不到',404);
 try { return NextResponse.json({item: await create(await openLedger(),actor.account.companyId,kind,await readJson<Record<string,unknown>>(r) ?? {})}, {status:201}); }
 catch(e) { if(e instanceof LedgerError) return refuse(e.message,e.status); throw e; }
}
