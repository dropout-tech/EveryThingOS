"use client";

import { useState, type FormEvent } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { useConfirm } from "./ui/ConfirmDialog";
import { Field } from "./ui/Field";
import type { Team } from "@/lib/sources/types";

const field = "field";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function when(value: string | null) {
  return value ? value.slice(0, 16) : "還沒登入過";
}

/** People, their job, two-step login. `live` false means practice mode: nothing is sent. */
export function TeamBoard({ team, live }: { team: Team; live: boolean }) {
  const action = useLiveAction();
  const [invite, setInvite] = useState({ email: "", full_name: "", profile: team.profiles.find((p) => !p.admin)?.name ?? "" });
  const [expiry, setExpiry] = useState(team.security.session_expiry ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const checkEmail = (value: string) => (!value.trim() ? "請填 Email，邀請信會寄到這裡。" : EMAIL.test(value.trim()) ? null : "Email 看起來不完整，例如 amy@example.tw。");
  const disabled = !live || action.busy;
  const [confirm, confirmDialog] = useConfirm();

  async function toggleEnabled(u: Team["users"][number]) {
    if (u.enabled && !(await confirm({ title: `停用 ${u.full_name}？`, body: `${u.email} 會馬上被登出，之後登不進來。資料都會留著，隨時可以恢復。`, confirmLabel: "停用", danger: true }))) return;
    action.run("/api/team/enabled", { user: u.email, enabled: !u.enabled }, (r) => String(r.message ?? "已更新"));
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = checkEmail(invite.email);
    setEmailError(problem);
    if (problem) {
      event.currentTarget.querySelector<HTMLInputElement>("input[name=email]")?.focus();
      return;
    }
    const result = await action.run("/api/team/invite", invite, (r) => String(r.message ?? `已邀請 ${invite.email}`));
    if (result?.ok) setInvite((f) => ({ ...f, email: "", full_name: "" }));
  }

  const security = (body: Record<string, unknown>) => action.run("/api/team/security", body, (r) => String(r.message ?? "安全設定已更新"));

  return (
    <div className="space-y-5">
      {!live ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-cream-dim">
          <Badge tone="practice" />
          這是範例團隊，按鈕先關著。接上 ERPNext 之後，這裡改的就是真的帳號與權限。
        </p>
      ) : null}
      <ActionOutcomeNote outcome={action.outcome} />
      {confirmDialog}

      <section className="glass sm:overflow-x-auto">
        <table className="table-stack">
          <caption className="sr-only">同事</caption>
          <thead>
            <tr>
              <th scope="col">人</th>
              <th scope="col">職務</th>
              <th scope="col">最近登入</th>
              <th scope="col">
                <span className="sr-only">停用或恢復</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {team.users.map((u) => (
              <tr key={u.email} className={u.enabled ? "" : "opacity-60"}>
                <td data-primary="">
                  {u.href ? (
                    <a href={u.href} target="_blank" rel="noreferrer" className="hover:text-teal">
                      {u.full_name}
                    </a>
                  ) : (
                    u.full_name
                  )}
                  <span className="block text-xs font-normal text-cream-dim">{u.email}</span>
                  {u.enabled ? null : <Badge tone="warn" className="mt-1">已停用</Badge>}
                </td>
                <td data-label="職務">
                  <select
                    aria-label={`${u.full_name} 的職務`}
                    value={u.profile ?? ""}
                    disabled={disabled || !u.enabled}
                    onChange={(e) => action.run("/api/team/profile", { user: u.email, profile: e.target.value }, (r) => String(r.message ?? "已更新"))}
                    className={`${field} w-auto min-w-28`}
                  >
                    {u.profile ? null : <option value="">（自訂角色）</option>}
                    {team.profiles.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label="最近登入" className="text-cream-dim">{when(u.last_login)}</td>
                <td className="sm:text-right">
                  {u.email === team.me ? (
                    <span className="text-xs text-cream-dim">你自己</span>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleEnabled(u)}
                      className={`btn btn-sm ${u.enabled ? "btn-danger" : "btn-secondary"}`}
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

      <form id="invite" onSubmit={submitInvite} noValidate aria-labelledby="invite-title" className="glass grid gap-3 p-4 sm:flex sm:flex-wrap sm:items-start">
        <h2 id="invite-title" className="section-title w-full">
          邀請同事
        </h2>
        <Field label="名字" className="sm:w-40">
          <input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} maxLength={140} autoComplete="off" enterKeyHint="next" className={field} />
        </Field>
        <Field label="Email" className="sm:w-64" error={emailError}>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            enterKeyHint="next"
            required
            value={invite.email}
            onChange={(e) => {
              setInvite({ ...invite, email: e.target.value });
              if (emailError) setEmailError(checkEmail(e.target.value));
            }}
            onBlur={(e) => {
              if (e.target.value) setEmailError(checkEmail(e.target.value));
            }}
            className={field}
          />
        </Field>
        <Field label="職務" className="sm:w-36">
          <select value={invite.profile} onChange={(e) => setInvite({ ...invite, profile: e.target.value })} className={field}>
            {team.profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions sticky-submit sm:pt-[1.35rem]">
          <Button type="submit" variant="primary" disabled={!live} pending={action.busy} pendingLabel="處理中…" className="w-full sm:w-auto">
            寄出邀請
          </Button>
        </div>
        <p className="w-full text-xs text-cream-dim">{live ? "對方會收到設定密碼的信。不收人頭費，要幾個帳號就開幾個。" : "練習中不會真的寄出。接上 ERPNext 後就能邀請。"}</p>
      </form>

      <details className="disclosure card">
        <summary className="min-h-10 text-sm">
          <span aria-hidden className="disclosure-mark">
            ›
          </span>
          每個職務看得到什麼（{team.profiles.length} 種）
        </summary>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {team.profiles.map((p) => (
            <li key={p.name} className="glass-well p-3 text-sm">
              <p>{p.name}</p>
              <p className="mt-1 text-xs text-cream-dim">{p.note || `${p.roles.length} 個 ERPNext 角色`}</p>
            </li>
          ))}
        </ul>
      </details>

      <section className="glass space-y-3 p-5">
        <h2 className="section-title">登入安全</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={disabled}
            onClick={() => security({ two_factor: !(team.security.enable_two_factor_auth && team.security.two_factor_for_everyone) })}
            className="btn btn-secondary btn-sm"
          >
            兩步驟登入：{team.security.enable_two_factor_auth && team.security.two_factor_for_everyone ? "全員開啟" : "關閉"}
          </button>
          <select
            aria-label="兩步驟方式"
            value={team.security.two_factor_method ?? "OTP App"}
            disabled={disabled}
            onChange={(e) => security({ two_factor_method: e.target.value })}
            className={`${field} w-auto text-xs`}
          >
            <option value="OTP App">驗證器 App</option>
            <option value="Email">Email 驗證碼</option>
          </select>
          <button
            type="button"
            disabled={disabled}
            onClick={() => security({ password_policy: !team.security.enable_password_policy })}
            className="btn btn-secondary btn-sm"
          >
            密碼強度檢查：{team.security.enable_password_policy ? "開" : "關"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => security({ lockout_attempts: team.security.allow_consecutive_login_attempts ? 0 : 5 })}
            className="btn btn-secondary btn-sm"
          >
            連錯鎖定：{team.security.allow_consecutive_login_attempts ? `${team.security.allow_consecutive_login_attempts} 次` : "關"}
          </button>
          <span className="flex items-center gap-2 text-xs">
            <label htmlFor="session-expiry">閒置登出</label>
            <input id="session-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="08:00" inputMode="numeric" className={`${field} w-24`} />
            <button type="button" disabled={disabled} onClick={() => security({ session_expiry: expiry })} className="btn btn-secondary btn-sm">
              存
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}
