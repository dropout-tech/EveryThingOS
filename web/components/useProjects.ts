"use client";

import { useMemo } from "react";
import { demoKey, useBoardState } from "@/lib/demo-state";
import type { ProjectsData, ProjectsDemoState } from "@/lib/projects";

/** Live: what ERPNext returned. Demo: the same projects, with edits kept in this browser tab. */
export function useProjects(data: ProjectsData, live: boolean, demoId: string) {
  const initial = useMemo<ProjectsDemoState>(() => ({ projects: data.projects, tasks: data.tasks, logs: data.logs, invoices: [] }), [data]);
  return useBoardState(demoKey("projects", demoId), initial, live);
}
