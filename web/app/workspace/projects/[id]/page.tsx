import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { ModuleFrame } from "@/components/ModuleFrame";
import { ProjectDetail } from "@/components/ProjectDetail";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { buttonClass } from "@/components/ui/Button";
import { getProjects, projectsContext } from "@/lib/sources/projects";

export const metadata = { title: "專案" };

export default async function ProjectPage({ params }: PageProps<"/workspace/projects/[id]">) {
  const { id } = await params;
  const { pack, scene, demoId } = await projectsContext();
  const source = await getProjects(pack, scene);
  if (source.origin === "error") return <SourceFailure source={source} next={`/workspace/projects/${encodeURIComponent(id)}`} />;
  const data = source.data;
  if (!data) {
    return (
      <ModuleFrame kicker="專案" title="專案">
        <EmptyState title="你的 ERPNext 角色看不到專案。" detail="請老闆在「團隊」幫你的帳號加上專案的角色（Projects User）。" help="module-projects" />
      </ModuleFrame>
    );
  }
  const live = source.origin === "live";
  const project = data.projects.find((p) => p.id === id);

  return (
    <ModuleFrame
      kicker="專案"
      title={project?.name ?? "專案"}
      action={
        <>
          {project && project.status === "active" && data.can.log ? (
            <a href="#log" className={buttonClass({ variant: "primary" })}>
              記工時
            </a>
          ) : null}
          <Link href="/workspace/projects" className={buttonClass({ variant: "ghost" })}>
            全部專案
          </Link>
        </>
      }
    >
      <ProjectDetail data={data} live={live} demoId={demoId} packId={pack.id} id={id} deskUrl={live ? source.deskUrl : undefined} />
      <SourceNote source={source} demoText="示範資料。改動只留在這個瀏覽器分頁，不會送出。" />
    </ModuleFrame>
  );
}
