"use client";

import { useState, type FormEvent } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import type { Team } from "@/lib/sources/types";

const field = "mt-1 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream";

function when(value: string | null) {
  return value ? value.slice(0, 16) : "還沒登入過";
}

/** People, their job, two-step login. `live` false means practice mode: nothing is sent. */
export function TeamBoard({ team, live }: { team: Team; live: boolean }) {
  const action = useLiveAction();
  const [invite, setInvite] = useState({ email: "", full_name: "", profile: team.profiles.find((p) => !p.admin)?.name ?? "" });
  const [expiry, setExpiry] = useState(team.security.session_expiry ?? "");
  const disabled = !live || action.busy;

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    const result = await action.run("/api/team/invite", invite, (r) => String(r.message ?? `已邀請 ${invite.email}`));
    if (result?.ok) setInvite((f) => ({ ...f, email: "", full_name: "" }));
  }

  const security = (body: Record<string, unknown>) => action.run("/api/team/security", body, (r) => String(r.message ?? "安全設定已更新"));

  return (
    <div className="space-y-5">
      {!live ? <p className="text-xs text-cream-dim">練習模式：這是範例團隊。接上 ERPNext 之後，這裡改的就是真的帳號與權限。</p> : null}
      <ActionOutcomeNote outcome={action.outcome} />

      <section className="glass overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-cream-dim">
            <tr>
              <th className="px-4 py-3 font-normal">人</th>
              <th className="px-4 py-3 font-normal">職務</th>
              <th className="px-4 py-3 font-normal">最近登入</th>
              <th className="px-4 py-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {team.users.map((u) => (
              <tr key={u.email} className={`border-t border-[var(--line)] ${u.enabled ? "" : "opacity-50"}`}>
                <td className="px-4 py-3">
                  {u.href ? (
                    <a href={u.href} target="_blank" rel="noreferrer" className="hover:text-teal">
                      {u.full_name}
                    </a>
                  ) : (
                    u.full_name
                  )}
                  <span className="block text-xs text-cream-dim">{u.email}</span>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`${u.full_name} 的職務`}
                    value={u.profile ?? ""}
                    disabled={disabled || !u.enabled}
                    onChange={(e) => action.run("/api/team/profile", { user: u.email, profile: e.target.value }, (r) => String(r.message ?? "已更新"))}
                    className={`${field} mt-0 py-1`}
                  >
                    {u.profile ? null : <option value="">（自訂角色）</option>}
                    {team.profiles.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-cream-dim">{when(u.last_login)}</td>
                <td className="px-4 py-3 text-right">
                  {u.email === team.me ? (
                    <span className="text-xs text-cream-dim">你自己</span>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => action.run("/api/team/enabled", { user: u.email, enabled: !u.enabled }, (r) => String(r.message ?? "已更新"))}
                      className="glass-pill px-3 py-1 text-xs disabled:opacity-40"
                    >
                      {u.enabled ? "停用" : "恢復"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form onSubmit={submitInvite} className="glass flex flex-wrap items-end gap-2 p-4">
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">名字</span>
          <input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} maxLength={140} className={`${field} w-36`} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">Email</span>
          <input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className={`${field} w-56`} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">職務</span>
          <select value={invite.profile} onChange={(e) => setInvite({ ...invite, profile: e.target.value })} className={field}>
            {team.profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={disabled} className="glass-cta rounded-full px-4 py-2 text-sm disabled:opacity-50">
          {action.busy ? "處理中…" : "邀請"}
        </button>
        <p className="w-full text-xs text-cream-dim">對方會收到設定密碼的信。不收人頭費，要幾個帳號就開幾個。</p>
      </form>

      <section className="grid gap-3 md:grid-cols-2">
        {team.profiles.map((p) => (
          <div key={p.name} className="glass-well p-4 text-sm">
            <p>{p.name}</p>
            <p className="mt-1 text-xs text-cream-dim">{p.note || `${p.roles.length} 個 ERPNext 角色`}</p>
          </div>
        ))}
      </section>

      <section className="glass space-y-3 p-5">
        <h3 className="text-sm">登入安全</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={disabled}
            onClick={() => security({ two_factor: !(team.security.enable_two_factor_auth && team.security.two_factor_for_everyone) })}
            className="glass-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            兩步驟登入：{team.security.enable_two_factor_auth && team.security.two_factor_for_everyone ? "全員開啟" : "關閉"}
          </button>
          <select
            aria-label="兩步驟方式"
            value={team.security.two_factor_method ?? "OTP App"}
            disabled={disabled}
            onChange={(e) => security({ two_factor_method: e.target.value })}
            className={`${field} mt-0 py-1 text-xs`}
          >
            <option value="OTP App">驗證器 App</option>
            <option value="Email">Email 驗證碼</option>
          </select>
          <button
            type="button"
            disabled={disabled}
            onClick={() => security({ password_policy: !team.security.enable_password_policy })}
            className="glass-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            密碼強度檢查：{team.security.enable_password_policy ? "開" : "關"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => security({ lockout_attempts: team.security.allow_consecutive_login_attempts ? 0 : 5 })}
            className="glass-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            連錯鎖定：{team.security.allow_consecutive_login_attempts ? `${team.security.allow_consecutive_login_attempts} 次` : "關"}
          </button>
          <span className="flex items-center gap-2 text-xs">
            閒置登出
            <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="08:00" className={`${field} mt-0 w-20 py-1`} />
            <button type="button" disabled={disabled} onClick={() => security({ session_expiry: expiry })} className="glass-pill px-3 py-1 disabled:opacity-40">
              存
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}
