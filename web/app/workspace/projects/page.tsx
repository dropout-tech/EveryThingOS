import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { ModuleFrame } from "@/components/ModuleFrame";
import { ProjectsBoard } from "@/components/ProjectsBoard";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { buttonClass } from "@/components/ui/Button";
import { getProjects, projectsContext } from "@/lib/sources/projects";

export const metadata = { title: "專案與工時" };

export default async function ProjectsPage() {
  const { pack, scene, demoId } = await projectsContext();
  const source = await getProjects(pack, scene);
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/projects" />;
  const live = source.origin === "live";
  const data = source.data;

  if (!data) {
    return (
      <ModuleFrame kicker="專案" title="每一案賺不賺">
        <EmptyState
          title="你的 ERPNext 角色看不到專案。"
          detail="請老闆在「團隊」幫你的帳號加上專案的角色（Projects User），就能在這裡看專案、記工時。"
          help="module-projects"
        />
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      kicker="專案"
      title="每一案賺不賺"
      hint="合約金額、到目前的成本、還沒請款的工時都在這裡。在工地或客戶那邊，用手機按「記工時」就好。"
      action={
        data.can.log && data.projects.some((p) => p.status === "active") ? (
          <a href="#log" className={buttonClass({ variant: "primary" })}>
            記工時
          </a>
        ) : null
      }
    >
      <Hint id="projects" help="module-projects" />
      {live && !data.projects.length ? (
        <EmptyState
          title="還沒有專案"
          detail="在 ERPNext 開第一個專案，填上客人、合約金額（業務訂單）和預估成本，回來就能記工時、看毛利。"
          action={data.newProjectHref ? { href: data.newProjectHref, label: "在 ERPNext 開專案" } : undefined}
          help="module-projects"
        />
      ) : (
        <ProjectsBoard data={data} live={live} demoId={demoId} />
      )}
      <SourceNote source={source} demoText="示範資料。接上 ERPNext 後，換成你們的專案、工作項目和工時表。" />
    </ModuleFrame>
  );
}
