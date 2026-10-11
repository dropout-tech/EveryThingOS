import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure } from "@/components/SourceNote";
import { TeamBoard } from "@/components/TeamBoard";
import { getAudit, getTeam } from "@/lib/sources";
import type { AuditRow, Team } from "@/lib/sources/types";

export const metadata = { title: "團隊" };

const DEMO: Team = {
  me: "boss@example.tw",
  active: 4,
  users: [
    { email: "boss@example.tw", full_name: "王老闆", enabled: 1, profile: "老闆", admin: true, last_login: "2026-10-11 08:40", last_active: null },
    { email: "amy@example.tw", full_name: "林業務", enabled: 1, profile: "業務", admin: false, last_login: "2026-10-11 09:12", last_active: null },
    { email: "chen@example.tw", full_name: "陳倉管", enabled: 1, profile: "倉管", admin: false, last_login: "2026-10-10 17:05", last_active: null },
    { email: "acct@example.tw", full_name: "張會計", enabled: 1, profile: "會計", admin: false, last_login: null, last_active: null },
  ],
  profiles: [
    { name: "老闆", note: "全部都能看、能做，也能管人和安全設定", roles: [], admin: true },
    { name: "主管", note: "全部都能看、能做，但不能管人和安全設定", roles: [], admin: false },
    { name: "業務", note: "客人、報價、訂單", roles: [], admin: false },
    { name: "倉管", note: "庫存、出貨、收貨", roles: [], admin: false },
    { name: "採購", note: "請購、採購單、廠商", roles: [], admin: false },
    { name: "會計", note: "發票、收付款、帳務", roles: [], admin: false },
    { name: "客服", note: "對話、客人資料", roles: [], admin: false },
    { name: "行銷", note: "電子報、名單、官網", roles: [], admin: false },
    { name: "人資", note: "員工資料、請假核准、打卡、薪資", roles: [], admin: false },
  ],
  security: { enable_two_factor_auth: 0, two_factor_for_everyone: 0, two_factor_method: "OTP App", enable_password_policy: 1, minimum_password_score: "3", session_expiry: "08:00", allow_consecutive_login_attempts: 5, deny_multiple_sessions: 0 },
};

const DEMO_AUDIT: AuditRow[] = [
  { at: "2026-10-11 09:12", who: "林業務", what: "登入", detail: "" },
  { at: "2026-10-11 09:20", who: "林業務", what: "改了 報價單", detail: "SAL-QTN-2026-00012" },
  { at: "2026-10-10 17:05", who: "陳倉管", what: "改了 出貨單", detail: "MAT-DN-2026-00031" },
];

export default async function TeamPage() {
  const [team, audit] = await Promise.all([getTeam(), getAudit()]);
  if (team.origin === "error") {
    if (team.kind === "denied") {
      return (
        <ModuleFrame kicker="團隊" title="只有老闆可以管人">
          <p className="glass p-5 text-sm text-cream-dim">要新增同事、改職務或停用帳號，請公司裡職務是「老闆」的人來做。</p>
        </ModuleFrame>
      );
    }
    return <SourceFailure source={team} next="/workspace/team" />;
  }
  const live = team.origin === "live";
  const rows = audit.origin === "live" ? audit.data : audit.origin === "demo" ? DEMO_AUDIT : [];

  return (
    <ModuleFrame kicker="團隊" title="誰能看什麼、做什麼" hint="職務就是 ERPNext 的角色組合；改職務立刻生效，停用的人馬上登出。">
      <TeamBoard team={team.data ?? DEMO} live={live} />
      <section className="glass-well space-y-2 p-5">
        <h2 className="text-sm font-medium">最近紀錄</h2>
        {audit.origin === "error" ? <p className="text-sm text-warn">{audit.message}</p> : null}
        {rows.length ? (
          <ul className="space-y-1 text-sm">
            {rows.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex flex-wrap gap-x-3">
                <span className="text-cream-dim">{r.at.slice(0, 16)}</span>
                <span>{r.who}</span>
                <span>{r.what}</span>
                {r.href ? (
                  <a href={r.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {r.detail}
                  </a>
                ) : (
                  <span className="text-cream-dim">{r.detail}</span>
                )}
              </li>
            ))}
          </ul>
        ) : audit.origin !== "error" ? (
          <p className="text-sm text-cream-dim">還沒有紀錄。</p>
        ) : null}
      </section>
    </ModuleFrame>
  );
}
