import { EmptyState } from "@/components/EmptyState";
import { ModuleFrame } from "@/components/ModuleFrame";
import { PortalBoard } from "@/components/portal/PortalBoard";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { Badge } from "@/components/ui/Badge";
import type { PortalLink } from "@/lib/portal";
import { listLinks, portalMode, PortalError, withUrls } from "@/lib/portal-server";
import { getBooks } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "客戶入口" };

const HINT = "報價、訂單、發票做成一個連結，用 LINE 傳給客人。客人用手機打開就能看明細、簽名接受、看怎麼付款，你在這裡看到他看了沒、簽了沒。";

export default async function PortalPage() {
  const pack = await currentIndustry();
  const mode = await portalMode();

  if (mode.mode === "unconfigured") {
    return (
      <ModuleFrame kicker="客戶入口" title="傳給客人的連結" hint={HINT}>
        <EmptyState title="客戶入口還沒接好" detail={`${mode.reason}請 DropOut OS 導入顧問設定。`} help="module-portal" />
      </ModuleFrame>
    );
  }

  const books = await getBooks(pack);
  if (books.origin === "error") return <SourceFailure source={books} next="/workspace/portal" />;

  let links: PortalLink[] = [];
  let glueError: string | null = null;
  if (mode.mode === "live") {
    try {
      links = await withUrls(await listLinks(mode.config), mode.site);
    } catch (error) {
      glueError = error instanceof PortalError ? error.message : "現在拿不到分享連結的紀錄";
    }
  }

  return (
    <ModuleFrame kicker="客戶入口" title="傳給客人的連結" hint={HINT} badge={mode.mode === "demo" ? <Badge tone="demo" /> : undefined}>
      {glueError ? (
        <section className="glass space-y-1 p-5" role="alert">
          <p className="font-medium">現在拿不到分享連結的紀錄</p>
          <p className="text-sm text-cream-dim">{glueError}。稍後再整理一次這頁；客人那邊這時候也可能打不開，急的話先傳 PDF。</p>
        </section>
      ) : (
        <PortalBoard live={mode.mode === "live"} links={links} docs={books.data.sales} packId={pack.id} company={mode.mode === "live" ? mode.config.tenant?.company : null} />
      )}
      <SourceNote source={books} demoText="示範資料。做出來的連結會標「示範」，簽了也不會送到任何公司；看過幾次、簽了沒，只記在這個瀏覽器。" />
    </ModuleFrame>
  );
}
