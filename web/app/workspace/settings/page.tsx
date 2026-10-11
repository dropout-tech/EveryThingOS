import Link from "next/link";
import { ModuleFrame } from "@/components/ModuleFrame";
import { PRICE_LABEL } from "@/lib/commercial";
import { SetupProgress } from "@/components/SetupProgress";
import { FEATURES, SIZES, sceneById } from "@/lib/shop";
import { getDeadLetters, getMe, getSetup, isLive } from "@/lib/sources";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { deskUrl } from "@/lib/sources/erpnext";
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
};

const SYNC_NOTICE: Record<string, string> = {
  replayed: "已重送。",
  failed: "重送失敗，看上面的原因。",
  denied: "只有 ERPNext 的 System Manager 可以重送。",
  "bad-id": "找不到這筆。",
  "not-connected": "系統同步還沒接上。",
};

export default async function SettingsPage({ searchParams }: PageProps<"/workspace/settings">) {
  const shop = await currentShop();
  const pack = await currentIndustry();
  const [setup, dead, me, config] = await Promise.all([getSetup(), getDeadLetters(), getMe(), liveConfig()]);
  const live = Object.fromEntries(await Promise.all(SYSTEMS.map(async ([id]) => [id, await isLive(id)] as const))) as Record<SystemId, boolean>;
  const account = config.tenant;
  const exportUrl = deskUrl("/app/backups", config);
  const { sync } = await searchParams;
  const notice = typeof sync === "string" ? SYNC_NOTICE[sync] : null;
  const scene = sceneById(shop?.scene);
  const size = SIZES.find((item) => item.id === shop?.size);

  return (
    <ModuleFrame kicker="設定" title={pack.nameZh}>
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
              <li key={id} className="flex gap-2">
                <span aria-hidden>{live[id] ? "●" : "○"}</span>
                <span>{label}</span>
                <span className="text-cream-dim">{live[id] ? "已接上" : demo}</span>
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
          </div>
        ) : null}
        <p className="flex flex-wrap gap-4 text-sm text-cream-dim">
          {account?.profile ? null : (
            <Link href="/?setup=1" className="hover:text-cream">
              重設現場與功能
            </Link>
          )}
          {exportUrl ? (
            <a href={exportUrl} className="hover:text-cream">
              匯出全部資料（ERPNext 備份）
            </a>
          ) : null}
          <a href="/api/shop/profile" className="hover:text-cream">
            下載設定檔（給導入工具）
          </a>
          <Link href="/pricing" className="hover:text-cream">
            {PRICE_LABEL}
          </Link>
          {loginRequired(config) ? (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="hover:text-cream">
                登出
              </button>
            </form>
          ) : null}
        </p>
      </div>

      {setup.origin === "live" && setup.data ? <SetupProgress setup={setup.data} /> : null}

      {live.glue ? (
        <section id="sync" className="glass-well space-y-3 p-5">
          <h3 className="text-sm">系統同步</h3>
          {notice ? (
            <p className="glass-chip px-3 py-2 text-sm" role="status">
              {notice}
            </p>
          ) : null}
          {dead.origin === "error" ? (
            <p className="text-sm text-orange">{dead.message}</p>
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
                    <button type="submit" className="text-teal">
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
