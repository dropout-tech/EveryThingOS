"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ActionNote } from "../ActionNote";
import { ActionOutcomeNote, useLiveAction } from "../LiveAction";
import { EmptyState } from "../EmptyState";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { buttonClass } from "../ui/Button";
import { useConfirm } from "../ui/ConfirmDialog";
import { Drawer } from "../ui/Drawer";
import { Field } from "../ui/Field";
import { Money } from "../ui/Money";
import { SearchBox } from "../ui/SearchBox";
import { CopyLink, demoLinksKey, LineShare, requestLink, saveDemoLink, ShareDrawer, type DemoLink } from "./ShareDrawer";
import { demoKey, useBoardState, useDemoState } from "@/lib/demo-state";
import { formatTwd, type SalesDoc } from "@/lib/erp";
import { DEMO_TRACK_PREFIX, EXPIRY_CHOICES, KIND_LABEL, KIND_OF, dayText, linkChip, readDemoTrack, shareableDoctype, timeText, writeDemoTrack, type PortalLink } from "@/lib/portal";

type Filter = "all" | "open" | "signed" | "closed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "open", label: "還能打開" },
  { id: "signed", label: "已簽" },
  { id: "closed", label: "過期／撤回" },
];

function subscribeTracks(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** Views and signatures from the customer's tab in this browser, as one string so React can compare snapshots. */
function useDemoTracks(ids: string[]) {
  const raw = useSyncExternalStore(
    subscribeTracks,
    () => ids.map((id) => localStorage.getItem(DEMO_TRACK_PREFIX + id) ?? "").join("\u0001"),
    () => "",
  );
  const key = ids.join(",");
  return useMemo(() => {
    const parts = raw.split("\u0001");
    return new Map(
      key
        .split(",")
        .filter(Boolean)
        .map((id, i) => [id, parts[i] ? readDemoTrack(id) : null]),
    );
  }, [raw, key]);
}

function withTrack(link: DemoLink, now: number, track: ReturnType<typeof readDemoTrack> | null): DemoLink {
  const revokedAt = link.revokedAt ?? track?.revokedAt ?? null;
  const expired = Date.parse(link.expiresAt) <= now;
  return {
    ...link,
    viewCount: track?.views ?? 0,
    firstViewedAt: track?.firstViewedAt ?? null,
    lastViewedAt: track?.lastViewedAt ?? null,
    acceptedAt: track?.acceptedAt ?? null,
    acceptedName: track?.acceptedName ?? null,
    revokedAt,
    state: revokedAt ? "revoked" : expired ? "expired" : "active",
  };
}

export function PortalBoard({ live, links: liveLinks, docs, packId, company }: { live: boolean; links: PortalLink[]; docs: SalesDoc[]; packId: string; company?: string | null }) {
  const action = useLiveAction();
  const [confirm, confirmDialog] = useConfirm();
  const [demoLinks, setDemoLinks] = useDemoState<DemoLink[]>(demoLinksKey(packId), []);
  const tracks = useDemoTracks(live ? [] : demoLinks.map((l) => l.id));
  const [now] = useState(() => Date.now());
  const links: PortalLink[] = live ? liveLinks : demoLinks.map((l) => withTrack(l, now, tracks.get(l.id) ?? null));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sharing, setSharing] = useState<SalesDoc | null>(null);
  const [pick, setPick] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const opened = links.find((l) => l.id === openId) ?? null;

  const [salesDocs] = useBoardState(demoKey("sales", packId), docs, live);
  const shareable = useMemo(() => salesDocs.filter((d) => shareableDoctype(d)), [salesDocs]);
  const needle = query.trim().toLowerCase();
  const shown = links.filter((l) => {
    if (needle && !`${l.party} ${l.docname}`.toLowerCase().includes(needle)) return false;
    if (filter === "open") return l.state === "active" && !l.acceptedAt;
    if (filter === "signed") return Boolean(l.acceptedAt);
    if (filter === "closed") return l.state !== "active";
    return true;
  });
  const counts = {
    sent: links.filter((l) => l.state === "active").length,
    viewed: links.filter((l) => l.viewCount > 0).length,
    signed: links.filter((l) => l.acceptedAt).length,
  };

  async function revoke(link: PortalLink) {
    const ok = await confirm({
      title: `撤回 ${link.docname} 的連結？`,
      body: `${link.party} 再打開會看到「連結已收回」。要再給他看，得重新做一個連結。`,
      confirmLabel: "撤回",
      danger: true,
    });
    if (!ok) return;
    if (live) {
      await action.run(`/api/portal/links/${link.id}`, { action: "revoke" }, (r) => String(r.message ?? "已撤回"));
      return;
    }
    const at = new Date().toISOString();
    writeDemoTrack(link.id, (t) => ({ ...t, revokedAt: at }));
    setDemoLinks((current) => current.map((l) => (l.id === link.id ? { ...l, revokedAt: at, state: "revoked" } : l)));
    setNote(`示範：已撤回 ${link.docname} 的連結。在這個瀏覽器再打開，會看到「連結已收回」。`);
  }

  async function extend(link: PortalLink, days: number) {
    if (live) {
      await action.run(`/api/portal/links/${link.id}`, { action: "expiry", days }, (r) => String(r.message ?? "已改到期日"));
      return;
    }
    const source = demoLinks.find((l) => l.id === link.id)?.source;
    if (!source) return;
    setBusyId(link.id);
    const out = await requestLink(source, days, false, link.id);
    setBusyId(null);
    if (!out.ok || !out.link) {
      setNote(out.message ?? "沒有改成，請再試一次。");
      return;
    }
    saveDemoLink(packId, out.link, source);
    setNote(`示範：${link.docname} 改成 ${days} 天後到期。請重新複製連結。`);
  }

  return (
    <div className="space-y-5">
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      {confirmDialog}

      <section className="glass space-y-3 p-4 md:p-5" aria-labelledby="share-new">
        <h2 id="share-new" className="section-title">
          傳一張單給客人
        </h2>
        {shareable.length ? (
          <form
            className="grid gap-3 sm:flex sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const doc = shareable.find((d) => d.no === pick);
              if (doc) setSharing(doc);
            }}
          >
            <Field label="哪一張" className="min-w-0 sm:flex-1" hint="報價單可以線上簽；發票可以下載 PDF、看付款方式。">
              <select className="field" value={pick} onChange={(event) => setPick(event.target.value)} required>
                <option value="">選一張報價、訂單或發票</option>
                {shareable.map((d) => {
                  const doctype = shareableDoctype(d)!;
                  return (
                    <option key={`${doctype}-${d.no}`} value={d.no}>
                      {KIND_LABEL[KIND_OF[doctype]]} {d.no}・{d.party}・含稅 {formatTwd(d.amount + d.tax)}
                    </option>
                  );
                })}
              </select>
            </Field>
            <div className="form-actions sm:pb-[1.6rem]">
              <button type="submit" className={buttonClass({ variant: "primary", className: "w-full sm:w-auto" })} disabled={!pick}>
                下一步
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-cream-dim">
            還沒有可以傳的報價、訂單或發票。先到{" "}
            <Link href="/workspace/erp/sales" className="underline underline-offset-2">
              生意
            </Link>{" "}
            開一張報價。
          </p>
        )}
      </section>

      {links.length ? (
        <>
          <ul className="kpi-grid">
            <li className="kpi">
              <span className="kpi-label">還能打開</span>
              <span className="kpi-value">{counts.sent}</span>
            </li>
            <li className="kpi">
              <span className="kpi-label">客人看過</span>
              <span className="kpi-value">{counts.viewed}</span>
            </li>
            <li className="kpi">
              <span className="kpi-label">已簽回</span>
              <span className="kpi-value">{counts.signed}</span>
            </li>
          </ul>

          <div className="toolbar flex-wrap">
            <SearchBox label="找連結" placeholder="客戶或單號" value={query} onChange={setQuery} />
            <div className="flex flex-wrap gap-1" role="group" aria-label="篩選">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={buttonClass({ variant: filter === f.id ? "secondary" : "ghost", size: "sm" })}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass">
            <table className="table-stack">
              <thead>
                <tr>
                  <th scope="col">單據</th>
                  <th scope="col" className="num" data-numeric="">
                    含稅
                  </th>
                  <th scope="col">狀態</th>
                  <th scope="col">到期</th>
                  <th scope="col">
                    <span className="sr-only">動作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const chip = linkChip(l);
                  return (
                    <tr key={l.id}>
                      <td data-label="單據" data-primary="">
                        <button type="button" className="flex min-w-0 items-center gap-2 text-left" aria-haspopup="dialog" onClick={() => setOpenId(l.id)}>
                          <Avatar name={l.party || l.docname} />
                          <span className="min-w-0">
                            <span className="block truncate underline decoration-[color-mix(in_srgb,currentColor_30%,transparent)] underline-offset-4">{l.party || "（沒有客戶名）"}</span>
                            <span className="block text-xs font-normal text-cream-dim">
                              {KIND_LABEL[KIND_OF[l.doctype]]} <span className="num">{l.docname}</span>
                            </span>
                          </span>
                        </button>
                      </td>
                      <td data-label="含稅" className="num" data-numeric="">
                        <Money amount={l.amount} />
                      </td>
                      <td data-label="狀態">
                        <Badge tone={chip.tone}>{chip.label}</Badge>
                      </td>
                      <td data-label="到期" className="text-sm text-cream-dim">
                        {l.state === "revoked" ? "—" : dayText(l.expiresAt)}
                      </td>
                      <td data-label="動作">
                        <span className="flex flex-wrap justify-end gap-1">
                          {l.state === "active" && l.url ? <CopyLink url={l.url} className={buttonClass({ variant: "ghost", size: "sm" })} /> : null}
                          <button type="button" className={buttonClass({ variant: "ghost", size: "sm" })} onClick={() => setOpenId(l.id)}>
                            細節
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!shown.length ? <p className="p-4 text-sm text-cream-dim">沒有符合的連結。</p> : null}
          </div>
        </>
      ) : (
        <EmptyState
          title="還沒傳過連結給客人"
          detail="選一張報價單，做成連結用 LINE 傳出去。客人用手機打開就能看明細、簽名接受；發票可以下載 PDF、看怎麼付款。"
          help="module-portal"
          compact
        />
      )}

      <ShareDrawer doc={sharing} onClose={() => setSharing(null)} live={live} packId={packId} company={company} />

      <Drawer
        open={Boolean(opened)}
        title={opened ? `${opened.party || opened.docname}・${KIND_LABEL[KIND_OF[opened.doctype]]}` : ""}
        onClose={() => setOpenId(null)}
        footer={
          opened && opened.state === "active" && opened.url ? (
            <>
              <LineShare url={opened.url} company={company} link={opened} />
              <CopyLink url={opened.url} />
            </>
          ) : null
        }
      >
        {opened ? <LinkDetail link={opened} live={live} busy={action.busy || busyId === opened.id} onRevoke={() => revoke(opened)} onExtend={(d) => extend(opened, d)} /> : null}
      </Drawer>
    </div>
  );
}

function LinkDetail({ link, live, busy, onRevoke, onExtend }: { link: PortalLink; live: boolean; busy: boolean; onRevoke: () => void; onExtend: (days: number) => void }) {
  const [days, setDays] = useState(14);
  const chip = linkChip(link);
  return (
    <div className="space-y-5">
      <dl>
        <dt>單號</dt>
        <dd className="num">{link.docname}</dd>
        <dt>含稅</dt>
        <dd>
          <Money amount={link.amount} />
        </dd>
        <dt>狀態</dt>
        <dd>
          <Badge tone={chip.tone}>{chip.label}</Badge>
        </dd>
        <dt>做連結</dt>
        <dd>
          {timeText(link.createdAt)}
          {live && link.createdBy ? `・${link.createdBy}` : ""}
        </dd>
        <dt>第一次打開</dt>
        <dd>{link.firstViewedAt ? timeText(link.firstViewedAt) : "還沒打開"}</dd>
        {link.lastViewedAt && link.viewCount > 1 ? (
          <>
            <dt>最近一次</dt>
            <dd>{timeText(link.lastViewedAt)}</dd>
          </>
        ) : null}
        {link.acceptedAt ? (
          <>
            <dt>簽回</dt>
            <dd>
              {link.acceptedName}・{timeText(link.acceptedAt)}
            </dd>
          </>
        ) : null}
        <dt>{link.state === "revoked" ? "撤回" : "到期"}</dt>
        <dd>{link.state === "revoked" ? timeText(link.revokedAt) : dayText(link.expiresAt)}</dd>
      </dl>

      {link.acceptedAt && link.doctype === "Quotation" ? (
        <p className="text-sm text-cream-dim">{live ? "簽名圖和接受紀錄已存進 ERPNext 這張報價單的附件與留言。下一步：到「生意」把它轉成訂單。" : "示範：真的連結會把簽名圖和接受紀錄存進 ERPNext 這張報價單。下一步：到「生意」把它轉成訂單。"}</p>
      ) : null}

      {link.state !== "revoked" ? (
        <div className="space-y-3 border-t border-[var(--line)] pt-4">
          <Field label="改到期日" hint={link.state === "expired" ? "過期的連結延長後，客人就能再打開。" : "從今天起算。"}>
            <select className="field" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              {EXPIRY_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d} 天後
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass({ variant: "secondary", size: "sm" })} disabled={busy} onClick={() => onExtend(days)}>
              {busy ? "處理中…" : "改到期日"}
            </button>
            <button type="button" className={buttonClass({ variant: "danger", size: "sm" })} disabled={busy} onClick={onRevoke}>
              撤回連結
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-cream-dim">這個連結已撤回。要再給客人看，請從上面重新做一個。</p>
      )}
    </div>
  );
}
