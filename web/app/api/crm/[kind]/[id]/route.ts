import { readActor } from '@/lib/accounts/guard';
import { sameOrigin, refuse } from '@/lib/actions';
import { openLedger } from '@/lib/ledger/read';
import { LedgerError } from '@/lib/ledger/errors';
import { complete, get, kindOf } from '@/lib/workspace-data/store';
import { NextResponse, type NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(_r: NextRequest, {params}: {params: Promise<{kind:string;id:string}>}) {
 const actor = await readActor(); if(actor.status !== 'ok') return refuse('請先登入',401);
 const {kind: raw,id} = await params; const kind = kindOf(raw); if(!kind) return refuse('找不到',404);
 const item = await get(await openLedger(),actor.account.companyId,kind,id); return item ? NextResponse.json({item}) : refuse('找不到',404);
}
export async function PATCH(r: NextRequest, {params}: {params: Promise<{kind:string;id:string}>}) {
 if(!sameOrigin(r)) return refuse('來源不符',403);
 const actor = await readActor(); if(actor.status !== 'ok') return refuse('請先登入',401);
 const {kind,id} = await params; if(kind !== 'tasks') return refuse('找不到',404);
 try { return NextResponse.json({item:await complete(await openLedger(),actor.account.companyId,id)}); } catch(e) {if(e instanceof LedgerError) return refuse(e.message,e.status); throw e;}
}
