import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { COMMERCIAL } from "@/lib/commercial";

export const metadata = { title: "登入", description: "用 Google 帳號登入 EveryThingOS。", robots: { index: false } };

const REASONS: Record<string, { title: string; next: string }> = {
  google: { title: "還沒設定 Google 登入。", next: "請聯絡管理員設定登入。" },
  secret: { title: "登入密鑰不夠長。", next: "SESSION_SECRET 至少要 16 個字。" },
  state: { title: "登入逾時，或是從另一個分頁開始的。", next: "再按一次「用 Google 登入」。" },
  token: { title: "Google 沒有完成登入。", next: "再試一次。" },
  profile: { title: "讀不到這個 Google 帳號的 Email。", next: "請改用有 Email、而且已驗證的 Google 帳號。" },
  unverified: { title: "這個 Google 信箱還沒驗證。", next: "請換一個已驗證的信箱。" },
  denied: { title: "這個 Google 帳號還沒被邀請。", next: "請老闆在團隊頁邀請這個信箱。" },
  disabled: { title: "這個帳號已停用。", next: "請老闆恢復之後再登入。" },
  access_denied: { title: "你在 Google 取消了授權。", next: "要進來，請再登入一次並允許。" },
  bound: { title: "這個信箱已經綁了另一個 Google 帳號。", next: "請用當初登入的那個 Google，或請老闆到團隊頁協助。" },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const reason = typeof error === "string" ? (REASONS[error] ?? { title: "登入沒有完成。", next: "請再試一次。" }) : null;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/workspace";

  return (
    <main id="main" className="site-scope flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="site-sheet w-full max-w-md space-y-6 p-6 sm:p-8">
        <BrandMark />
        <div className="space-y-3">
          <p className="text-sm text-cream-dim">登入</p>
          <h1 className="text-2xl font-medium">用 Google 登入 EveryThingOS</h1>
          <p className="text-sm text-cream-dim">帳號是 Google。職務和誰能管人存在這套平台自己的資料庫。</p>
        </div>
        {reason ? (
          <div role="alert" className="rounded-2xl border border-[var(--line)] p-4 text-sm">
            <p className="site-error font-medium">{reason.title}</p>
            <p className="mt-1 text-cream-dim">{reason.next}</p>
          </div>
        ) : null}
        <a href={`/api/auth/login?next=${encodeURIComponent(target)}`} className="glass-cta inline-flex w-full justify-center rounded-full px-6 py-3 font-medium">
          用 Google 登入
        </a>
        <nav aria-label="需要幫忙" className="flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm text-cream-dim">
          <Link href="/help" className="hover:text-cream">
            說明中心
          </Link>
          <Link href="/status" className="hover:text-cream">
            系統狀態
          </Link>
          <a href={`mailto:${COMMERCIAL.email}?subject=${encodeURIComponent("EveryThingOS 登入問題")}`} className="hover:text-cream">
            寫信給我們
          </a>
        </nav>
      </div>
      <Link href="/" className="mt-6 text-sm text-cream-dim hover:text-cream">
        回 EveryThingOS 首頁
      </Link>
    </main>
  );
}
