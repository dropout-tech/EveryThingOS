export function ActionNote({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className="glass-chip px-4 py-2 text-sm" role="status">
      {children}
    </p>
  );
}
