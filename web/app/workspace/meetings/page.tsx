import { EmptyState } from "@/components/EmptyState";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { UpcomingMeetings } from "@/components/UpcomingMeetings";
import { getMeetings } from "@/lib/sources";
import type { Meetings } from "@/lib/sources/types";

export const metadata = { title: "會議紀錄" };

const DEMO: Meetings = {
  bot: true,
  failedCalendars: 0,
  upcoming: [
    { key: "demo-1", title: "每週產銷會議", start: new Date(Date.now() + 3600_000).toISOString(), platform: "google_meet", url: "", attendees: ["a@example.com", "b@example.com"], skipped: false, sent: false },
    { key: "demo-2", title: "客戶需求訪談", start: new Date(Date.now() + 26 * 3600_000).toISOString(), platform: "zoom", url: "", attendees: ["c@example.com"], skipped: false, sent: false },
  ],
  summaries: [
    {
      title: "顧問訪談：安安商行",
      summary: "1. 重點：年底前要換掉 Excel 報價\n2. 決定：先導入報價到收款\n3. 待辦：小林週五前寄報價（安安商行）",
      at: "2026-10-08 14:00:00",
      attendees: ["anan@example.com"],
      party: "安安商行",
    },
  ],
};

export default async function MeetingsPage() {
  const source = await getMeetings();
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/meetings" />;
  const data = source.data ?? DEMO;
  const live = source.origin === "live";

  return (
    <ModuleFrame kicker="會議紀錄" title="會議自己記，摘要進客人" hint="機器人照公司行事曆，開會前自己進 Zoom、Google Meet、Teams；會後整理成重點、決定、待辦，記在與會客人的時間軸上。">
      <section className="space-y-2">
        <h3 className="text-sm">接下來的會</h3>
        {data.upcoming === null ? (
          <EmptyState compact title="會議機器人還沒接上" detail="導入工具加上 --vexa-url 與公司行事曆後，這裡會列出接下來的會，機器人會自己進會議做紀錄。" help="module-meetings" />
        ) : !data.bot && live ? (
          <p className="text-sm text-cream-dim">這家公司還沒開會議機器人。</p>
        ) : live ? (
          <UpcomingMeetings meetings={data.upcoming} />
        ) : (
          <ul className="space-y-2">
            {data.upcoming.map((m) => (
              <li key={m.key} className="glass-chip flex items-center justify-between p-3">
                <span>{m.title}</span>
                <span className="text-xs text-cream-dim">{m.platform === "zoom" ? "Zoom" : "Google Meet"} · 開始前會自動進去（練習）</span>
              </li>
            ))}
          </ul>
        )}
        {data.failedCalendars ? <p className="text-xs text-orange">{data.failedCalendars} 個行事曆讀不到，請到設定看同步失敗的原因。</p> : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm">最近的摘要</h3>
        {data.summaries.length ? (
          <ul className="space-y-2">
            {data.summaries.map((s, i) => (
              <li key={`${s.at}-${i}`} className="glass p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>{s.title}</p>
                  <p className="text-xs text-cream-dim">
                    {s.at?.slice(0, 16)}
                    {s.party ? ` · ${s.party}` : ""}
                    {s.href ? (
                      <>
                        {" · "}
                        <a href={s.href} target="_blank" rel="noreferrer" className="text-teal">
                          打開
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-cream-dim">{s.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="還沒有會議摘要" detail="機器人進過一場會之後，重點、決定、待辦會出現在這裡，也會記在與會客人的時間軸上。" help="module-meetings" />
        )}
      </section>

      <SourceNote source={source} demoText="示範資料。接上 ERPNext 與會議機器人後換成你們的會。" />
    </ModuleFrame>
  );
}
