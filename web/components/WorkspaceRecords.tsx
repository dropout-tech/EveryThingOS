"use client";
import { useEffect, useState } from 'react';
type Row = { id:string; name?:string; title?:string; body?:string; assignee?:string; completed?:number; phone?:string; email?:string; notes?:string };
export function WorkspaceRecords({kind}: {kind:'customers'|'tasks'|'documents'}) {
 const [rows,setRows]=useState<Row[]>([]), [customers,setCustomers]=useState<Row[]>([]), [message,setMessage]=useState('');
 const refresh=async()=>{const r=await fetch(`/api/crm/${kind}`); if(r.ok) setRows((await r.json()).items); else setMessage('請先登入');};
 useEffect(()=>{ void refresh(); if(kind!=='customers') void fetch('/api/crm/customers').then(r=>r.ok?r.json():{items:[]}).then(d=>setCustomers(d.items)); },[kind]);
 async function submit(e:React.FormEvent<HTMLFormElement>) { e.preventDefault(); const f=e.currentTarget; const data=Object.fromEntries(new FormData(f)); const r=await fetch(`/api/crm/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const d=await r.json(); if(!r.ok){setMessage(d.message);return;} f.reset();setMessage('已建立');await refresh(); }
 return <section className="space-y-4"><form onSubmit={submit} className="space-y-3"><label className="block">{kind==='customers'?'姓名':'標題'} <input name={kind==='customers'?'name':'title'} required className="text-black" /></label>
 {kind==='customers'&&<><label className="block">電話 <input name="phone" className="text-black" /></label><label className="block">Email <input name="email" type="email" className="text-black" /></label><label className="block">備註 <textarea name="notes" className="text-black" /></label></>}
 {kind!=='customers'&&<label className="block">客人 <select aria-label="客人" name="party_id" className="text-black"><option value="">不連結</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
 {kind==='tasks'&&<><label className="block">指派給 <input name="assignee" className="text-black" /></label><label className="block">報價單號 <input name="quote_id" className="text-black" /></label></>}
 {kind==='documents'&&<label className="block">內容 <textarea name="body" className="text-black" /></label>}
 <button className="rounded bg-white px-3 py-2 text-black">建立{kind==='customers'?'客人':kind==='tasks'?'任務':'文件'}</button></form><p>{message}</p>
 <ul className="space-y-3">{rows.map(row=><li key={row.id} className="rounded border p-3"><strong>{row.name||row.title}</strong>{row.phone&&<p>電話：{row.phone}</p>}{row.email&&<p>Email：{row.email}</p>}{row.notes&&<p>備註：{row.notes}</p>}{row.assignee&&<span> · {row.assignee}</span>}{row.body&&<pre className="whitespace-pre-wrap">{row.body}</pre>}{kind==='tasks'&&(row.completed?' · 已完成':<button className="ml-3 underline" onClick={async()=>{await fetch(`/api/crm/tasks/${row.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});await refresh();}}>完成</button>)}</li>)}</ul></section>;
}
