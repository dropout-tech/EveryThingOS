import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { enabledErpLabels } from "@/lib/industries";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "ERP" };

export default async function ErpPage() {
  const pack = await currentIndustry();
  const { orders } = demoRecords(pack);
  const erp = pack.modules.erp;

  return (
    <ModuleFrame
      kicker="DropOut ERP"
      title={`${pack.nameZh} 的營運`}
      hint={`物項以「${pack.itemType}」計價，履行為「${pack.fulfillment}」。沒打開的能力不會出現在這家公司的流程裡。`}
    >
      <ul className="flex flex-wrap gap-2 text-sm">
        {enabledErpLabels(pack).map((label) => (
          <li key={label} className="rounded-full bg-ink-2 px-3 py-1">
            {label}
          </li>
        ))}
      </ul>
      <p className="text-sm text-cream-dim">
        庫存 {onOff(erp.inventory)} · 製造 {onOff(erp.manufacturing)} · POS {onOff(erp.pos)} · 專案{" "}
        {onOff(erp.projects)} · 批次 {onOff(erp.batch)}
      </p>
      <DataTable
        columns={["單號", "客戶", "物項", "狀態", "金額"]}
        rows={orders.map((order) => [order.no, order.party, order.item, order.status, order.amount])}
      />
    </ModuleFrame>
  );
}

function onOff(value: boolean) {
  return value ? "開" : "關";
}
