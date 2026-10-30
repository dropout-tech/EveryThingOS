import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { DemoLogin } from "@/components/DemoLogin";
import { LoginButton } from "@/components/LoginButton";
import { COMMERCIAL } from "@/lib/commercial";
import { liveConfig, loginRequired } from "@/lib/sources/config";

export const metadata = { title: "登入", description: "用公司的 ERPNext 帳號登入 EveryThingOS。", robots: { index: false } };

const REASONS: Record<string, { title: string; next: string }> = {
  state: { title: "登入逾時，或是從另一個分頁開始的。", next: "再按一次「登入」就好。" },
  token: { title: "ERPNext 沒有發出登入憑證。", next: "請公司管理者確認 OAuth Client 的轉回網址跟這個網站一樣；還是不行請寫信給我們。" },
  profile: { title: "登入成功，但讀不到你的 ERPNext 使用者資料。", next: "請公司管理者確認你的帳號沒有被停用，再試一次。" },
  access_denied: { title: "你在 ERPNext 按了取消授權。", next: "要使用 EveryThingOS，請再登入一次並按「允許」。" },
  denied: { title: "ERPNext 沒有完成授權。", next: "再試一次；還是不行請公司管理者確認帳號權限。" },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const reason = typeof error === "string" ? (REASONS[error] ?? { title: "登入沒有完成。", next: "請再試一次。" }) : null;
  const target = typeof next === "string" ? next : "/workspace";
  const config = await liveConfig();
  const enabled = loginRequired(config);
  const company = config.tenant?.company;
  const erpHost = config.erpnext?.url ? new URL(config.erpnext.url).host : null;

  return (
    <main id="main" className="site-scope flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="site-sheet w-full max-w-md space-y-6 p-6 sm:p-8">
        <BrandMark />
        {config.unknownHost ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-medium">這個網址還沒有對應的公司</h1>
            <p className="text-cream-dim">
              {config.unknownHost} 沒有登記在 EveryThingOS。請確認網址是否打錯，或請公司管理者跟我們確認。
            </p>
          </div>
        ) : config.directoryError ? (
          <div className="space-y-3" role="alert">
            <h1 className="text-2xl font-medium">暫時查不到這是哪一家公司</h1>
            <p className="text-cream-dim">公司目錄現在連不上，通常幾分鐘內會恢復。可以先看系統狀態。</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-cream-dim">{company ? "登入這家公司" : "登入"}</p>
            <h1 className="text-2xl font-medium">{company ?? "用公司的 ERPNext 帳號登入"}</h1>
            <p className="text-sm text-cream-dim">
              帳號、密碼、兩步驟驗證與權限都在 ERPNext 管{erpHost ? `（${erpHost}）` : ""}。登入後看得到什麼，跟你在 ERPNext 的職務一樣。
            </p>
          </div>
        )}
        {reason ? (
          <div role="alert" className="rounded-2xl border border-[var(--line)] p-4 text-sm">
            <p className="site-error font-medium">{reason.title}</p>
            <p className="mt-1 text-cream-dim">{reason.next}</p>
          </div>
        ) : null}
        {config.unknownHost || config.directoryError ? null : enabled ? (
          <div className="space-y-3">
            <LoginButton href={`/api/auth/login?next=${encodeURIComponent(target)}`} label={reason ? "再登入一次" : "登入"} />
            {config.erpnext?.url ? (
              <p className="text-center text-sm">
                <a href={`${config.erpnext.url}/login#forgot`} className="text-cream-dim underline underline-offset-4 hover:text-cream">
                  忘記密碼
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <DemoLogin />
        )}
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
