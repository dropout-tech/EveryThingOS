const TONES = 6;

/** Chinese names show the surname; Latin names and handles show up to two initials. */
export function initials(name: string) {
  const clean = name.replace(/^[@#]+/, "").trim();
  if (!clean) return "•";
  const first = [...clean][0];
  if (!/[A-Za-z0-9]/.test(first)) return first;
  const words = clean.split(/[\s._-]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => [...word][0])
    .join("")
    .toUpperCase();
}

/** Same name, same colour, on every page and every visit. */
export function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % TONES) + 1;
}

type AvatarProps = {
  name?: string | null;
  size?: "md" | "lg";
  /** Set when no visible name sits next to the avatar. */
  label?: string;
  className?: string;
};

export function Avatar({ name, size = "md", label, className = "" }: AvatarProps) {
  const text = name?.trim() ?? "";
  return (
    <span
      className={`avatar ${size === "lg" ? "avatar-lg" : ""} ${className}`}
      data-tone={text ? avatarTone(text) : undefined}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      title={label}
    >
      {text ? initials(text) : "•"}
    </span>
  );
}
