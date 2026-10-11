import type { Books } from "../erp";

export type SystemId = "erpnext" | "glue" | "chatwoot";

/**
 * Every read the pages make returns one of these. Demo data is always labelled;
 * a live system that fails returns an error instead of quietly showing demo data.
 */
export type Sourced<T> =
  | { origin: "demo"; data: T }
  | { origin: "live"; system: SystemId; data: T; denied?: string[]; deskUrl?: string }
  | { origin: "error"; system: SystemId; message: string; kind: "login" | "denied" | "unreachable" | "upstream" };

export type Person = { name: string; stage: string; score: number; channel: string; href?: string };

export type SetupStatus = {
  steps: { id: string; label: string; count: number; done: boolean }[];
  done: number;
  total: number;
  issues: number;
};

export type DeadLetter = { id: number; kind: string; error: string; created_at: string };

export type LetterOverview = {
  groups: { name: string; title: string; subscribers: number; href?: string }[];
  consent: { granted: number; pending: number; withdrawn: number };
  newsletters: { name: string; subject: string; sent: boolean; scheduled: string | null; recipients: number; views: number; href?: string }[];
  last30Days: Partial<Record<"letter_opened" | "letter_clicked" | "email_bounced" | "unsubscribed" | "subscribed", number>>;
};

export type Me = { user: string; fullName: string; company: string; roles: string[]; chatwootUserId?: string };

export type { Books };
