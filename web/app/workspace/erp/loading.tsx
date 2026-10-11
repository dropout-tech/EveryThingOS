import { Skeleton } from "@/components/ui/Skeleton";

export default function ErpLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">正在拿帳本…</span>
      <Skeleton className="h-20" />
      <div className="grid gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
