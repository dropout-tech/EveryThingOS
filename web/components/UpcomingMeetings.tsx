"use client";

import type { UpcomingMeeting } from "@/lib/sources/types";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";

const PLATFORM: Record<UpcomingMeeting["platform"], string> = { google_meet: "Google Meet", zoom: "Zoom", teams: "Teams" };

function when(iso: string) {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** 等一下機器人會進的會. Each one can be turned off: 這場不要記. */
export function UpcomingMeetings({ meetings }: { meetings: UpcomingMeeting[] }) {
  const action = useLiveAction();
  if (!meetings.length) return <p className="text-sm text-cream-dim">接下來三天行事曆裡沒有 Meet、Zoom 或 Teams 的會。</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {meetings.map((m) => (
          <li key={m.key} className={`glass-chip flex flex-wrap items-center justify-between gap-3 p-3 ${m.skipped ? "opacity-60" : ""}`}>
            <div>
              <p>{m.title || "（沒有標題）"}</p>
              <p className="text-xs text-cream-dim">
                {when(m.start)} · {PLATFORM[m.platform]}
                {m.attendees.length ? ` · ${m.attendees.length} 人` : ""}
                {m.sent ? " · 機器人已派出" : m.skipped ? " · 這場不記" : " · 開始前會自動進去"}
              </p>
            </div>
            {!m.sent ? (
              <button
                type="button"
                disabled={action.busy}
                className="glass-pill px-3 py-1.5 text-xs disabled:opacity-40"
                onClick={() => action.run("/api/meetings/skip", { key: m.key, skip: !m.skipped }, (r) => (r.skipped ? `「${m.title}」不會記。` : `「${m.title}」會記。`))}
              >
                {m.skipped ? "改回要記" : "這場不要記"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <ActionOutcomeNote outcome={action.outcome} />
    </div>
  );
}
