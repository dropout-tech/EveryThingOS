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
  denied?: string[];
};

export type Catalog = {
  items: { item_code: string; item_name: string; uom: string; rate: number | null }[];
  parties: { party_type: "Customer" | "Lead"; party: string; label: string }[];
};

export type WebsiteOverview = {
  items: { code: string; name: string; route: string | null; href?: string }[];
  published: number;
  orders: { no: string; party: string; amount: number; status: string; date: string; href?: string }[];
  formLeads: number;
  shopUrl?: string;
  denied?: string[];
};

export type MeetingSummary = { title: string; summary: string; at: string | null; attendees: string[]; party?: string; href?: string };

export type UpcomingMeeting = { key: string; title: string; start: string; platform: "google_meet" | "zoom" | "teams"; url: string; attendees: string[]; skipped: boolean; sent: boolean };

export type Meetings = { summaries: MeetingSummary[]; upcoming: UpcomingMeeting[] | null; bot: boolean; failedCalendars: number; denied?: string[] };

export type HygieneRow = { email: string; result: string; action: string; href?: string };

export type Me = { user: string; fullName: string; company: string; roles: string[]; chatwootUserId?: string };

export type { Books };
