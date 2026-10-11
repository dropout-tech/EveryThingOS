import { EmptyState } from "@/components/EmptyState";
import { ImportWizard } from "@/components/ImportWizard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure } from "@/components/SourceNote";
import { Badge } from "@/components/ui/Badge";
import { ADMIN_ROLE } from "@/lib/access";
import { buildBooks } from "@/lib/erp";
import { isKind } from "@/lib/importer";
import { getMe } from "@/lib/sources";
import { liveConfig, writeBlocked } from "@/lib/sources/config";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "匯入資料" };

const TITLE = "把舊資料搬進來";
const HINT = "從 Excel 複製貼上，或上傳 CSV／Excel。系統會自動對欄位、先檢查一遍，有問題的列會跳過，最後可以下載沒進去的列改好再匯。";

export default async function ImportPage({ searchParams }: PageProps<"/workspace/settings/import">) {
  const pack = await currentIndustry();
  const config = await liveConfig();
  const live = Boolean(config.erpnext);
  const kind = (await searchParams).kind;
  const initialKind = isKind(kind) ? kind : null;

  if (live) {
    const me = await getMe();
    if (me.origin === "error") return <SourceFailure source={me} next="/workspace/settings/import" />;
    if (!me.data?.roles.includes(ADMIN_ROLE)) {
      return (
        <ModuleFrame kicker="設定" title={TITLE}>
          <EmptyState title="只有老闆可以匯入資料。" detail="匯入會一次新增很多客人、供應商或商品，所以只開給 ERPNext 的 System Manager。請老闆登入後再做，或請他把檔案交給導入顧問。" help="import-wizard" />
        </ModuleFrame>
      );
    }
    const blocked = writeBlocked(config);
    if (blocked) {
      return (
        <ModuleFrame kicker="設定" title={TITLE} badge={<Badge tone="readonly" />}>
          <EmptyState title="現在不能新增資料。" detail={blocked} action={{ href: "/workspace/settings#plan", label: "看方案與續約" }} help="renewal" />
        </ModuleFrame>
      );
    }
  }

  const records = demoRecords(pack);
  const books = buildBooks(pack);
  const demo = live
    ? undefined
    : {
        packId: pack.id,
        leads: records.leads,
        lastStage: pack.workflow.stages[pack.workflow.stages.length - 1],
        inventory: pack.modules.erp.inventory,
        existing: {
          customers: [...records.leads.map((l) => l.name), ...records.orders.map((o) => o.party)],
          suppliers: books.purchases.map((p) => p.vendor),
          items: books.stock.map((s) => s.sku),
        },
      };

  return (
    <ModuleFrame kicker="設定" title={TITLE} hint={HINT} badge={live ? undefined : <Badge tone="demo" />}>
      <ImportWizard live={live} initialKind={initialKind} demo={demo} />
    </ModuleFrame>
  );
}
