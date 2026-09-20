export function ActionNote({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className="rounded-xl border border-teal/40 bg-teal/10 px-4 py-2 text-sm text-teal" role="status">
      {children}
    </p>
  );
}
