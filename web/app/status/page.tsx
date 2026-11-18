import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta('/status', '系統狀態', '本機示範狀態');
export default function StatusPage() {
  return <main className="mx-auto max-w-4xl space-y-4 p-8"><h1 className="text-3xl">系統狀態</h1><p>目前顯示本機示範，沒有外部系統監控資料。</p></main>;
}
