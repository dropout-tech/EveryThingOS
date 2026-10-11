"use client";

import Link from "next/link";
import { PRACTICE_PATH, ROLES, ROLE_GUIDES, type RoleName } from "@/lib/guide";
import { useGuide, useGuideFlag, useGuideValue } from "@/lib/guide-state";

function isRole(value: string | null): value is RoleName {
  return Boolean(value) && (ROLES as readonly string[]).includes(value as string);
}

/**
 * 「你每天會用到的三件事」 for this person's job, until they close it. In
 * practice mode nobody is logged in, so the visitor picks whose eyes to look
 * through. `allowed` is the menu this person actually has; links outside it are
 * dropped so nobody is sent to a page they cannot open.
 */
export function RoleGuide({ allowed, variant = "today" }: { allowed: string[]; variant?: "today" | "settings" }) {
  const { role: liveRole } = useGuide();
  const picked = useGuideValue("practice-role");
  const role: RoleName = isRole(liveRole) ? liveRole : isRole(picked.value) ? picked.value : "老闆";
  const seen = useGuideFlag(`firstday:${role}`);
  if (!seen.ready) return null;

  if (variant === "settings" || seen.set) {
    if (variant === "today") return null;
    return (
      <p className="text-sm text-cream-dim">
        你的職務是「{role}」。{" "}
        {seen.set ? (
          <button type="button" className="underline hover:text-cream" onClick={seen.off}>
            在「今天」再看一次第一天要做的三件事
          </button>
        ) : (
          <Link href="/workspace" className="underline hover:text-cream">
            已放在「今天」最上面
          </Link>
        )}
        {" · "}
        <Link href={`/help/roles#${encodeURIComponent(role)}`} className="underline hover:text-cream">
          每個職務看得到什麼
        </Link>
      </p>
    );
  }

  const guide = ROLE_GUIDES[role];
  const three = guide.three.filter((item) => !item.href.startsWith("/workspace") || allowed.some((href) => item.href === href || (href !== "/workspace" && item.href.startsWith(`${href}/`))));

  return (
    <section className="glass-well space-y-4 p-6 md:p-8" aria-labelledby="firstday-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.2em] text-cream-dim uppercase">第一天 · {role}</p>
          <h2 id="firstday-title" className="mt-2 text-2xl font-medium">
            你每天會用到的三件事
          </h2>
          <p className="mt-1 text-sm text-cream-dim">{guide.who}。</p>
        </div>
        <button type="button" onClick={seen.on} className="glass-pill rounded-full px-3 py-1 text-xs">
          知道了，收起來
        </button>
      </div>

      {isRole(liveRole) ? null : (
        <div>
          <p id="role-pick" className="text-xs text-cream-dim">
            練習：換一個職務看看
          </p>
          <div role="group" aria-labelledby="role-pick" className="mt-2 flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={r === role}
                onClick={() => picked.set(r)}
                className={`glass-chip px-3 py-1 text-xs ${r === role ? "font-medium ring-2 ring-cream" : "text-cream-dim"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="grid gap-3 md:grid-cols-3">
        {three.map((item, index) => (
          <li key={item.title}>
            <Link href={item.href} className="glass-chip glass-lift block h-full p-4">
              <span className="display text-xs text-cream-dim">0{index + 1}</span>
              <span className="mt-1 block">{item.title}</span>
              <span className="mt-1 block text-xs text-cream-dim">{item.detail}</span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="flex flex-wrap gap-4 text-xs text-cream-dim">
        <Link href={PRACTICE_PATH} className="underline hover:text-cream">
          先練習一筆生意（不會動到真的帳）
        </Link>
        <Link href={`/help/roles#${encodeURIComponent(role)}`} className="underline hover:text-cream">
          「{role}」看得到什麼
        </Link>
      </p>
    </section>
  );
}
