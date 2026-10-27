"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { NextThing } from "./NextThing";
import { OvertimeForm } from "./OvertimeForm";
import { TeacherSchedule } from "./TeacherSchedule";
import { useConfirm } from "./ui/ConfirmDialog";
import { formatTwd } from "@/lib/erp";
import type { HrToday } from "@/lib/sources/types";

const LOG_LABEL = { IN: "上班", OUT: "下班" } as const;

const PAYROLL_STATE: Record<NonNullable<HrToday["payroll"]>["state"], string> = {
  not_started: "還沒開始",
  started: "已開薪資發放，還沒產生薪資單",
  slips: "薪資單在跑",
  paid: "這個月的薪資單都確認了",
};

function days(from: string, to: string) {
  return from === to ? from.slice(5) : `${from.slice(5)} – ${to.slice(5)}`;
}

function nowTime() {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function readLocation(): Promise<{ latitude?: number; longitude?: number }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({});
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({}), 4_000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        resolve({});
      },
      { enableHighAccuracy: false, timeout: 4_000, maximumAge: 300_000 },
    );
  });
}

/** `live` false is practice mode: buttons change this screen only and nothing is sent. */
export function HrBoard({ data, live }: { data: HrToday; live: boolean }) {
  const action = useLiveAction();
  const [locating, setLocating] = useState(false);
  const [logs, setLogs] = useState(data.me.logs);
  const [approvals, setApprovals] = useState(data.approvals);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const denied = new Set(data.denied ?? []);
  const shownLogs = live ? data.me.logs : logs;
  const shownApprovals = live ? data.approvals : approvals;
  const next = shownLogs.length ? (shownLogs[shownLogs.length - 1].type === "IN" ? "OUT" : "IN") : "IN";
  const firstApproval = denied.has("approvals") ? undefined : shownApprovals[0];
  const canClock = !(live && !data.me.employee);
  const clockIsHero = !firstApproval && canClock;

  async function clock(type: "IN" | "OUT") {
    if (live) {
      setLocating(true);
      try {
        const position = await readLocation();
        await action.run("/api/hr/checkin", { log_type: type, ...position }, (r) => String(r.message ?? `${LOG_LABEL[type]}打卡完成`));
      } finally {
        setLocating(false);
      }
      return;
    }
    const time = nowTime();
    setLogs((current) => [...current, { type, time }]);
    setNote(`練習：${LOG_LABEL[type]}打卡 ${time}，沒有送出。`);
  }

  function decide(name: string, employee: string, decision: "approve" | "reject") {
    const verb = decision === "approve" ? "核准" : "退回";
    if (live) {
      action.run("/api/hr/leave", { name, decision }, (r) => String(r.message ?? `已${verb} ${employee} 的假單`));
      return;
    }
    setApprovals((current) => current.filter((a) => a.name !== name));
    setNote(`練習：已${verb} ${employee} 的假單，沒有送出。`);
  }

  return (
    <div className="space-y-5">
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      {confirmDialog}

      {firstApproval ? (
        <NextThing
          title={`${firstApproval.employee}的假單在等你`}
          detail={`${firstApproval.leaveType} · ${days(firstApproval.fromDate, firstApproval.toDate)} · ${firstApproval.days} 天。${firstApproval.reason ? firstApproval.reason : "核准後才算請假。"}`}
          action={
            <button type="button" disabled={action.busy} onClick={() => decide(firstApproval.name, firstApproval.employee, "approve")} className="btn btn-primary">
              {action.busy ? "處理中…" : "核准"}
            </button>
          }
        />
      ) : clockIsHero ? (
        <NextThing
          title={shownLogs.length ? (next === "OUT" ? "還沒下班打卡" : "下一筆是上班打卡") : "今天還沒打卡"}
          detail={`${data.me.name}　${data.date}。${shownLogs.length ? shownLogs.map((l) => `${LOG_LABEL[l.type]} ${l.time}`).join("　") : "上下班各按一次。"}`}
          action={
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(["IN", "OUT"] as const).map((type) => (
                  <button key={type} type="button" disabled={action.busy || locating} onClick={() => clock(type)} className={`btn ${type === next ? "btn-primary" : "btn-secondary"} px-6`}>
                    {action.busy || locating ? "處理中…" : `${LOG_LABEL[type]}打卡`}
                  </button>
                ))}
              </div>
              {live ? <p className="text-xs text-cream-dim">允許定位的話，打卡會記下位置。不允許也能打卡。</p> : null}
            </div>
          }
        />
      ) : (
        <section className="glass space-y-3 p-5">
          <p className="text-sm text-cream-dim">你的帳號還沒連到員工資料。請人資在 ERPNext 的員工資料填上你的使用者帳號，就能在這裡打卡。</p>
        </section>
      )}

      {firstApproval ? (
        <section className="glass space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">{data.me.name}</h2>
            <p className="text-xs text-cream-dim">{data.date}</p>
          </div>
          {canClock ? (
            <>
              <p className="text-sm text-cream-dim">
                {shownLogs.length ? shownLogs.map((l) => `${LOG_LABEL[l.type]} ${l.time}`).join("　") : "今天還沒打卡"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(["IN", "OUT"] as const).map((type) => (
                  <button key={type} type="button" disabled={action.busy || locating} onClick={() => clock(type)} className="btn btn-secondary px-6">
                    {action.busy || locating ? "處理中…" : `${LOG_LABEL[type]}打卡`}
                  </button>
                ))}
              </div>
              {live ? <p className="text-xs text-cream-dim">允許定位的話，打卡會記下位置。不允許也能打卡。</p> : null}
            </>
          ) : (
            <p className="text-sm text-cream-dim">你的帳號還沒連到員工資料。請人資在 ERPNext 的員工資料填上你的使用者帳號，就能在這裡打卡。</p>
          )}
        </section>
      ) : null}

      {denied.has("on_leave") ? null : (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">今天誰請假</h2>
          {data.onLeave.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {data.onLeave.map((r) => (
                <li key={`${r.name}-${r.fromDate}`} className="glass-chip flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    {r.name}
                    <span className="ml-2 text-cream-dim">
                      {r.leaveType}
                      {r.halfDay ? "（半天）" : ""}
                    </span>
                  </span>
                  <span className="text-xs text-cream-dim">
                    {days(r.fromDate, r.toDate)}
                    {r.href ? (
                      <DeskLink href={r.href} className="ml-2 hover:text-cream">
                        打開
                      </DeskLink>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-cream-dim">今天大家都在。</p>
          )}
        </section>
      )}

      {denied.has("approvals") ? null : (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">等你核准的假單</h2>
          {shownApprovals.length ? (
            <ul className="space-y-2">
              {shownApprovals.map((a) => (
                <li key={a.name} className="glass flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <p>
                      {a.employee}
                      <span className="ml-2 text-cream-dim">
                        {a.leaveType} · {days(a.fromDate, a.toDate)} · {a.days} 天
                      </span>
                    </p>
                    {a.reason ? <p className="mt-1 text-xs text-cream-dim">{a.reason}</p> : null}
                  </div>
                  <span className="flex items-center gap-2">
                    <button type="button" disabled={action.busy} onClick={() => decide(a.name, a.employee, "approve")} className="btn btn-secondary btn-sm">
                      核准
                    </button>
                    <button type="button" disabled={action.busy} onClick={async () => {
                        if (await confirm({ title: `退回 ${a.employee} 的假單？`, body: `${a.leaveType} ${days(a.fromDate, a.toDate)}，共 ${a.days} 天。退回後要請對方重新申請。`, confirmLabel: "退回", danger: true }))
                          decide(a.name, a.employee, "reject");
                      }} className="btn btn-secondary btn-sm">
                      退回
                    </button>
                    {a.href ? (
                      <DeskLink href={a.href} className="text-xs text-cream-dim hover:text-cream">
                        打開
                      </DeskLink>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-cream-dim">沒有等你核准的假單。</p>
          )}
        </section>
      )}

      {(data.schedule?.length || data.can.schedule) ? (
        <TeacherSchedule
          initialSchedule={data.schedule ?? []}
          staff={data.staff ?? []}
          leaves={[
            ...data.onLeave.map((l) => ({ employeeName: l.name, leaveType: l.leaveType, fromDate: l.fromDate, toDate: l.toDate })),
            ...shownApprovals.map((a) => ({ employeeName: a.employee, leaveType: a.leaveType, fromDate: a.fromDate, toDate: a.toDate })),
          ]}
          today={data.date}
          canSchedule={Boolean(data.can.schedule)}
          live={live}
          run={action.run}
          busy={action.busy}
          onPractice={setNote}
        />
      ) : null}

      {data.payroll ? (
        <section className="glass-well space-y-2 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">{data.payroll.month} 薪資</h2>
            <p className="text-xs text-cream-dim">在職 {data.payroll.employees} 人</p>
          </div>
          <p className="text-lg">{PAYROLL_STATE[data.payroll.state]}</p>
          {data.payroll.state === "not_started" ? (
            <p className="text-sm text-cream-dim">到 ERPNext 開一張「薪資發放」，選這個月，系統會替每個人產生薪資單。</p>
          ) : (
            <p className="text-sm text-cream-dim">
              待確認 {data.payroll.draft} 張、已確認 {data.payroll.submitted} 張，實發合計 {formatTwd(data.payroll.netPay)}
            </p>
          )}
          {data.payroll.entries.length ? (
            <p className="flex flex-wrap gap-3 text-xs">
              {data.payroll.entries.map((e) => (
                <DeskLink key={e.name} href={e.href} className="underline underline-offset-2">
                  {e.name}
                </DeskLink>
              ))}
            </p>
          ) : null}
          {data.rates && (!data.rates.verified || !data.rates.current) ? (
            <p className="text-sm text-warn" role="status">
              {data.rates.current ? `${data.rates.year} 年的勞健保與扣繳費率還沒核對` : `費率還是 ${data.rates.year} 年的`}，發薪前請對照勞保局、健保署、財政部的公告。
              {data.rates.href ? (
                <DeskLink href={data.rates.href} className="ml-2 underline">
                  打開費率設定
                </DeskLink>
              ) : null}
            </p>
          ) : null}
        </section>
      ) : null}

      {data.can.overtime ? (
        <section className="glass space-y-3 p-5">
          <div>
            <h2 className="text-sm font-medium">記加班</h2>
            <p className="mt-1 text-xs text-cream-dim">依勞基法第 24、39 條的倍數算加班費，寫進當月薪資單的「加班費」。</p>
          </div>
          <OvertimeForm staff={data.staff ?? []} today={data.date} live={live} run={action.run} busy={action.busy} onPractice={setNote} />
        </section>
      ) : null}

      <section className="glass space-y-2 p-5 text-sm">
        <h2 className="font-medium">請假與加班的法定基準</h2>
        <p className="text-cream-dim">
          婚假 14 日、特休依年資、平日加班前兩小時是時薪的 4/3。特休在每個到職週年自動給。加班時數由人資輸入，不從打卡推算（休息、輪班、外勤要人判斷）。勞健保費率每年仍要對公告，空白的項目不扣。
        </p>
        <Link href="/help/module-hr" className="text-xs text-cream-dim underline underline-offset-2 hover:text-cream">
          看請假天數、加班倍數和免稅時數
        </Link>
      </section>
    </div>
  );
}
