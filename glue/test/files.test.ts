import { describe, expect, it, vi } from "vitest";
import { putTranscript, transcriptKey } from "../src/files";
import { runJob, type Deps } from "../src/jobs";
import { MemoryStore, type Tenant } from "../src/store";

describe("transcript files", () => {
  it("keeps the object key inside meetings/ and strips odd characters", () => {
    expect(transcriptKey("make.dropout.tw", "google_meet", "abc-123")).toBe("meetings/make.dropout.tw/google_meet-abc-123.txt");
    expect(transcriptKey("a/b", "x y", "../z")).toBe("meetings/a_b/x_y-.._z.txt");
  });

  it("skips the write when the bucket is not bound", async () => {
    expect(await putTranscript(undefined, "make.dropout.tw", "zoom", "1", "hello")).toBeNull();
  });

  it("stores the original transcript before the summary is written to the books", async () => {
    const store = new MemoryStore();
    const tenant: Tenant = {
      site: "make.dropout.tw",
      erpnext_url: "https://erp.example",
      erpnext_key: "k",
      erpnext_secret: "s",
      erpnext_webhook_secret: "hook",
      unsubscribe_secret: "unsub",
      vexa: { url: "https://vexa.example", api_key: "vk", webhook_token: "vt" },
    };
    store.tenants.set(tenant.site, tenant);
    await store.saveMeeting({ site: tenant.site, platform: "zoom", meeting_id: "99", title: "週會", attendees: [], started_at: "2026-10-26T02:00:00Z" });
    const puts: { key: string; body: string }[] = [];
    const files = {
      put: async (key: string, body: string) => void puts.push({ key, body }),
    } as unknown as R2Bucket;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/transcripts/")) return Response.json({ segments: [{ speaker: "王", text: "下週出貨" }] });
      return Response.json({ message: { ok: true } });
    }) as unknown as typeof fetch;
    const deps: Deps = {
      store,
      fetcher,
      summaryModel: "m",
      ai: { run: async () => ({ response: "重點：下週出貨" }) },
      files,
    };

    await runJob({ kind: "meeting_done", site: tenant.site, platform: "zoom", meeting_id: "99" }, deps);

    expect(puts).toEqual([{ key: "meetings/make.dropout.tw/zoom-99.txt", body: "王：下週出貨" }]);
  });
});
