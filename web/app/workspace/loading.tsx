import { Skeleton } from "@/components/ui/Skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">正在拿資料…</span>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
