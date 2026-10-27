import Link from "next/link";
import { ADMIN_ROLE } from "@/lib/access";
import { openInvoice } from "@/lib/billing";
import { LookForm } from "@/components/LookForm";
import { ModuleFrame } from "@/components/ModuleFrame";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { DEFAULT_BRAND } from "@/lib/brand";
import { PRICE_LABEL } from "@/lib/commercial";
import { RoleGuide } from "@/components/RoleGuide";
import { SetupChecklist } from "@/components/SetupChecklist";
import { SetupProgress } from "@/components/SetupProgress";
import { workspaceGuide } from "@/lib/guide-server";
import { FEATURES, SIZES, sceneById } from "@/lib/shop";
import { getDeadLetters, getMe, getSetup, isLive } from "@/lib/sources";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { deskUrl } from "@/lib/sources/erpnext";
import { liveBackup, type BackupStatus } from "@/lib/sources/live";
import type { SystemId } from "@/lib/sources/types";
import { currentIndustry, currentShop } from "@/lib/workspace";

export const metadata = { title: "設定" };

const SYSTEMS: [SystemId, string, string][] = [
  ["erpnext", "帳本與客人（ERPNext）", "示範資料，只在這台電腦走"],
  ["chatwoot", "對話（Chatwoot）", "還沒接"],
  ["glue", "系統同步、寄信、金流、會議紀錄", "還沒接"],
];

const KIND_LABEL: Record<string, string> = {
  chatwoot: "新對話",
  form: "官網表單",
  unsubscribe: "退訂",
  erpnext_event: "ERPNext 事件",
  mail: "寄信事件",
  payment: "金流通知",
  meeting_start: "派會議機器人",
  meeting_done: "會議摘要",
  calendar: "讀行事曆",
  webhook: "對外通知（Webhook）",
};

const SYNC_NOTICE: Record<string, string> = {
  replayed: "已重送。",
  failed: "重送失敗，看上面的原因。",
  denied: "只有 ERPNext 的 System Manager 可以重送。",
  "bad-id": "找不到這筆。",
  "not-connected": "系統同步還沒接上。",
};

const when = (iso: string) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const size = (bytes?: number) => `${((bytes ?? 0) / 1048576).toFixed(1)} MB`;

function backupLine(b: BackupStatus | null) {
  if (!b) return "讀不到";
  const o = b.offsite;
  const parts = [o.taken_at ? `異地 ${when(o.taken_at)}（${size(o.bytes)}）` : !o.enabled ? "沒有設定異地備份" : o.error ? "讀不到異地備份" : "異地還沒有備份"];
  if (b.local) parts.push(`本機 ${when(b.local.taken_at)}`);
  if (b.encrypted) parts.push("有加密");
  return parts.join(" · ");
}

export default async function SettingsPage({ searchParams }: PageProps<"/workspace/settings">) {
  const shop = await currentShop();
  const pack = await currentIndustry();
  const [setup, dead, me, config, guide] = await Promise.all([getSetup(), getDeadLetters(), getMe(), liveConfig(), workspaceGuide(pack)]);
  const live = Object.fromEntries(await Promise.all(SYSTEMS.map(async ([id]) => [id, await isLive(id)] as const))) as Record<SystemId, boolean>;
  const account = config.tenant;
  const invoice = account && me.origin === "live" && me.data?.roles.includes(ADMIN_ROLE) ? await openInvoice(config) : null;
  const exportUrl = deskUrl("/app/backups", config);
  const owner = Boolean(exportUrl) && loginRequired(config) && me.origin === "live" && Boolean(me.data?.roles.includes(ADMIN_ROLE));
  const backup = owner ? await liveBackup().catch(() => null) : null;
  const { sync } = await searchParams;
  const notice = typeof sync === "string" ? SYNC_NOTICE[sync] : null;
  const scene = sceneById(shop?.scene);
  const size = SIZES.find((item) => item.id === shop?.size);

  return (
    <ModuleFrame kicker="設定" title={shop?.name ?? account?.company ?? pack.nameZh}>
      <div className="glass glass-hero space-y-5 p-6 md:p-8">
        <div>
          <p className="text-sm text-cream-dim">現場</p>
          <p className="mt-1">{scene.label} · {size?.label}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">打開的</p>
          <p className="mt-1">
            {FEATURES.filter((item) => shop?.modules.includes(item.id))
              .map((item) => item.label)
              .join("、") || "還沒選"}
          </p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">客人怎麼走</p>
          <p className="mt-1">{pack.workflow.stages.join(" → ")}</p>
        </div>
        <div>
          <p className="text-sm text-cream-dim">連線</p>
          <ul className="mt-1 space-y-1 text-sm">
            {SYSTEMS.map(([id, label, demo]) => (
              <li key={id} className="flex flex-wrap items-center gap-2">
                <span>{label}</span>
                {live[id] ? <Badge tone="ok">已接上</Badge> : <Badge>{demo}</Badge>}
              </li>
            ))}
          </ul>
        </div>
        {me.origin === "live" && me.data ? (
          <div>
            <p className="text-sm text-cream-dim">登入的人</p>
            <p className="mt-1">
              {me.data.fullName}（{me.data.user}）· {me.data.company}
            </p>
          </div>
        ) : null}
        {account ? (
          <div id="plan">
            <p className="text-sm text-cream-dim">方案與續約</p>
            <p className="mt-1">
              {account.company} · 年約{account.lifecycle.ends ? ` · 到 ${account.lifecycle.ends}` : ""}
            </p>
            {account.lifecycle.message ? <p className="mt-1 text-sm text-cream-dim">{account.lifecycle.message}</p> : null}
            {invoice ? (
              <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span>
                  續約帳單 {invoice.id}：NT${invoice.amount.toLocaleString("en-US")}（含 5% 營業稅）
                </span>
                <a href={invoice.pay_url} className={buttonClass({ variant: "primary", size: "sm" })}>
                  線上付款
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
          {account?.profile ? null : (
            <Link href="/?setup=1" className={buttonClass({ variant: "secondary", size: "sm" })}>
              重設現場與功能
            </Link>
          )}
          {exportUrl ? (
            <a href="#export" className={buttonClass({ variant: "secondary", size: "sm" })}>
              下載全部資料
            </a>
          ) : null}
          <a href="/api/shop/profile" className={buttonClass({ variant: "secondary", size: "sm" })}>
            下載設定檔（給導入工具）
          </a>
          <Link href="/workspace/settings/api" className={buttonClass({ variant: "secondary", size: "sm" })}>
            對外 API 與 Webhook
          </Link>
          <Link href="/workspace/practice" className={buttonClass({ variant: "ghost", size: "sm" })}>
            練習第一筆生意
          </Link>
          <Link href="/help" className={buttonClass({ variant: "ghost", size: "sm" })}>
            說明中心
          </Link>
          <Link href="/pricing" className={buttonClass({ variant: "ghost", size: "sm" })}>
            {PRICE_LABEL}
          </Link>
          {loginRequired(config) ? (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className={buttonClass({ variant: "ghost", size: "sm" })}>
                登出
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <LookForm brand={shop?.brand ?? DEFAULT_BRAND} name={shop?.name ?? ""} locked={Boolean(account?.profile)} />

      {exportUrl ? (
        <section id="export" className="glass-well space-y-3 p-5">
          <h2 className="font-medium">下載全部資料</h2>
          <p className="text-sm text-cream-dim">資料是你的。只能看、暫停、解約後 90 天內都可以下載。</p>
          {owner ? (
            <>
              <div className="flex flex-wrap gap-2">
                <a href="/api/export?kind=customers" className={buttonClass({ variant: "secondary", size: "sm" })}>客戶（CSV）</a>
                <a href="/api/export?kind=items" className={buttonClass({ variant: "secondary", size: "sm" })}>商品（CSV）</a>
                <a href="/api/export?kind=invoices" className={buttonClass({ variant: "secondary", size: "sm" })}>銷項發票（CSV）</a>
                <a href={exportUrl} className={buttonClass({ variant: "secondary", size: "sm" })}>完整備份（ERPNext 備份頁，含附件）</a>
              </div>
              <p className="text-sm text-cream-dim">最近備份：{backupLine(backup)}</p>
            </>
          ) : (
            <p className="text-sm">請老闆（System Manager）用自己的帳號登入後下載；沒有開個人登入時，請到 ERPNext 備份頁下載。</p>
          )}
        </section>
      ) : null}

      <section className="space-y-3" aria-label="導入教學">
        <RoleGuide allowed={guide.allowed} variant="settings" />
        {guide.checklist ? <SetupChecklist items={guide.checklist} practice={guide.practice} variant="settings" /> : null}
      </section>

      {setup.origin === "live" && setup.data ? <SetupProgress setup={setup.data} /> : null}

      {live.glue ? (
        <section id="sync" className="glass-well space-y-3 p-5">
          <h2 className="text-sm font-medium">系統同步</h2>
          {notice ? (
            <p className="toast" role="status">
              {notice}
            </p>
          ) : null}
          {dead.origin === "error" ? (
            <p className="text-sm text-warn">{dead.message}</p>
          ) : dead.data.length ? (
            <ul className="space-y-2">
              {dead.data.map((letter) => (
                <li key={letter.id} className="glass-chip flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    {KIND_LABEL[letter.kind] ?? letter.kind} · {letter.created_at}
                    <span className="block text-xs text-cream-dim">{letter.error.slice(0, 160)}</span>
                  </span>
                  <form action="/api/sync/replay" method="post">
                    <input type="hidden" name="id" value={letter.id} />
                    <button type="submit" className="btn btn-secondary btn-sm">
                      重送
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-cream-dim">沒有卡住的資料。</p>
          )}
        </section>
      ) : null}
    </ModuleFrame>
  );
}
