import { CrmBoard } from "@/components/CrmBoard";
import { Hint } from "@/components/Hint";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { sanitizeImportedHandle } from "@/lib/reply";
import { getPeople } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "客人" };

export default async function CrmPage({ searchParams }: PageProps<"/workspace/crm">) {
  const pack = await currentIndustry();
  const people = await getPeople(pack);
  if (people.origin === "error") return <SourceFailure source={people} next="/workspace/crm" />;
  const leads = people.data;
  const live = people.origin === "live";
  const from = live ? null : sanitizeImportedHandle((await searchParams).from);
  const initial = from
    ? [
        { name: from, stage: pack.workflow.stages[0], score: 24, channel: "IG 留言" },
        ...leads.filter((lead) => lead.name !== from),
      ]
    : leads;

  return (
    <ModuleFrame
      kicker="客人"
      title="一步一步跟到答應"
    >
      <Hint id="crm" help="module-crm" />
      <CrmBoard
        pack={{
          id: pack.id,
          itemType: pack.itemType,
          fulfillment: pack.fulfillment,
          modules: pack.modules,
          workflow: pack.workflow,
        }}
        initial={initial}
        live={live}
      />
      <SourceNote source={people} />
    </ModuleFrame>
  );
}
