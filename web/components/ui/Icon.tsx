const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

const PATHS = {
  today: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  person: `${ring(12, 8, 4)}M4 21c1-4 4-6 8-6s7 2 8 6`,
  people: `${ring(9, 8, 3.5)}M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.6 5.2`,
  chat: "M4 5h16v11H9.5L4 20.5z",
  mail: "M3 6h18v13H3zM3 7l9 6.5L21 7",
  meeting: "M3 6.5h12v11H3zM15 10.5l6-3.5v10l-6-3.5",
  sales: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  stock: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9",
  purchase: `M2.5 6h11v10h-11zM13.5 9.5h4l3.5 3.5v3h-7.5${ring(6.5, 18, 1.8)}${ring(17, 18, 1.8)}`,
  money: `M3 6h18v12H3z${ring(12, 12, 2.6)}M6.5 9v6M17.5 9v6`,
  reports: "M3.5 20.5h17M6 20.5v-7M12 20.5V4.5M18 20.5v-10",
  calendar: "M3.5 5.5h17v15h-17zM3.5 10h17M8 3v4M16 3v4",
  team: `${ring(12, 7.5, 3)}M6.5 20c.6-3.4 2.7-5.2 5.5-5.2s4.9 1.8 5.5 5.2${ring(5, 10, 2)}${ring(19, 10, 2)}M2 18c.3-1.8 1.3-3 2.8-3.4M22 18c-.3-1.8-1.3-3-2.8-3.4`,
  globe: `${ring(12, 12, 9)}M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3`,
  settings: `M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1${ring(15, 6.5, 2)}${ring(9, 12, 2)}${ring(17, 17.5, 2)}`,
  more: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  ask: "M11 3.5l1.9 4.6 4.6 1.9-4.6 1.9L11 16.5l-1.9-4.6L4.5 10l4.6-1.9zM18 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  share: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  briefcase: "M3.5 8h17v12h-17zM9 8V5h6v3M3.5 13h17",
  approve: `${ring(12, 12, 9)}M8 12.5l2.7 2.7L16 9.5`,
  bolt: "M13 2.5 5 13.5h6l-1 8 8-11h-6z",
  dot: ring(12, 12, 3),
} as const;

export type IconName = keyof typeof PATHS;

const BY_HREF: Record<string, IconName> = {
  "/workspace": "today",
  "/workspace/crm": "person",
  "/workspace/chat": "chat",
  "/workspace/letter": "mail",
  "/workspace/meetings": "meeting",
  "/workspace/erp/sales": "sales",
  "/workspace/erp/stock": "stock",
  "/workspace/erp/purchase": "purchase",
  "/workspace/erp/finance": "money",
  "/workspace/reports": "reports",
  "/workspace/hr": "calendar",
  "/workspace/team": "team",
  "/workspace/website": "globe",
  "/workspace/settings": "settings",
  "/workspace/ask": "ask",
  "/workspace/portal": "share",
  "/workspace/projects": "briefcase",
  "/workspace/approvals": "approve",
  "/workspace/automations": "bolt",
};

export const iconForHref = (href: string): IconName => BY_HREF[href.split("#")[0]] ?? "dot";

/** Decorative only: the label next to it carries the meaning. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
