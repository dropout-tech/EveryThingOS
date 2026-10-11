import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export const metadata = { title: "登入" };

const REASONS: Record<string, string> = {
  state: "登入逾時或從別的分頁開始，請再按一次。",
  token: "ERPNext 沒有發出登入憑證。請確認 OAuth Client 的轉回網址與這個網站一致。",
  profile: "登入成功，但讀不到你的 ERPNext 使用者資料。",
  access_denied: "你在 ERPNext 取消了授權。",
  denied: "ERPNext 沒有完成授權。",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const reason = typeof error === "string" ? (REASONS[error] ?? "登入沒有完成，請再試一次。") : null;
  const target = typeof next === "string" ? next : "/workspace";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-5 text-center">
      <BrandMark />
      <h1 className="text-2xl">用公司的 ERPNext 帳號登入</h1>
      <p className="max-w-md text-sm text-cream-dim">帳號、密碼與權限都在 ERPNext 管。這裡看得到什麼，跟你在 ERPNext 的角色一樣。</p>
      {reason ? (
        <p className="glass-chip max-w-md px-4 py-2 text-sm" role="alert">
          {reason}
        </p>
      ) : null}
      <a href={`/api/auth/login?next=${encodeURIComponent(target)}`} className="glass-cta rounded-full px-6 py-3 text-sm">
        登入
      </a>
      <Link href="/" className="text-sm text-cream-dim hover:text-cream">
        回首頁
      </Link>
    </div>
  );
}
