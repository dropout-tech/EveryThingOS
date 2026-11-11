# Dodo service receiver v1

Status: implementation in a draft branch; no live CRM integration is claimed. Each API key resolves one ERPNext site. Dodo keeps call evidence; EVERYTHING OS owns CRM parties and the service activity / follow-up records. Raw transcripts, recordings and arbitrary callback URLs are not accepted.

## Authorization and routes

Use a dedicated `dok_live_…` key with `service:read` and, when needed, `service:write`. Existing `read` / `write` keys do not implicitly acquire these scopes. Granting `service:write` also grants `service:read`, but does not grant generic CRM read/write. Revoked keys are rejected before upstream access. Account write locks block new activity creation; receipt lookup remains readable.

- `POST /v1/party-candidates`, scope `service:read`: body `{ "phone": "+886900000001" }`. This is a read-only lookup using a body so the phone is not put in URLs. E.164 input, at most 10 distinct candidates, response `{ "data": [{ "party_type": "Customer", "id": "...", "display_name": "..." }], "has_more": false }`. No automatic creation, merge or identity verification. An empty result is not an authorization decision.
- `POST /v1/service-activities`, scope `service:write`, `Content-Type: application/json`, required `Idempotency-Key` containing a lowercase canonical UUID. No query parameters. The key is stable across key rotation and retries.
- `GET /v1/operations/{operationId}`, scope `service:read`, no query parameters. Looks up the committed Dodo operation in the authenticated site. A 404 does not prove a concurrent write never happened; retry only with the original key and body.

## Activity body

All objects reject unknown fields. Text is plain text; recipients must escape it when rendering HTML. JSON bytes are capped at 16,384. IDs use `[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}`. No caller-provided site or company selection is accepted.

```json
{
  "schema_version": 1,
  "source": "dodo",
  "source_tenant_id": "dropout-internal",
  "source_project_id": "project-1",
  "source_record_id": "call-1",
  "source_record_type": "voice_call",
  "occurred_at": "2026-11-11T00:00:00.000Z",
  "summary": "來電者想了解客服服務，請人工說明可行範圍。",
  "outcome": "needs_followup",
  "party": null,
  "handoff": {
    "description": "請先確認需求與方便聯絡時段。",
    "priority": "normal",
    "contact_name": "測試聯絡人",
    "contact_phone": "+886900000001",
    "contact_email": null,
    "preferred_contact_window": "平日下午"
  }
}
```

`source_record_type` is `voice_call` or `handoff`; `outcome` is `needs_followup`, `resolved`, `no_contact` or `unknown`. Required summary is 1–2,000 characters. `occurred_at` must be a valid UTC timestamp with milliseconds in the exact displayed format; preserve it, do not use an implicit local timezone. `party` and `handoff` may be omitted or null (canonicalize both to null). A party is `{ "party_type": "Customer" | "Lead", "id": "...", "confirmed": true }`; ID is a nonempty string of at most 140 characters without controls. Linking it is an operator assertion, not proof the caller is authenticated. The party must exist in the authenticated site; disabled Customers are rejected.

When present, handoff requires `description` (1–2,000 characters) and `priority` (`normal` or `urgent`). Optional contact name (140), contact phone (E.164, max 16), contact email (140) and preferred contact window (200) canonicalize missing fields to null. Unknown fields, control characters except newline/tab in summary/description, invalid email, or invalid Unicode scalar strings are rejected. Required fields are not silently truncated. `needs_followup` requires a handoff; `no_contact` must not create one. Other outcomes may include a handoff when a real follow-up is required. No client-specified assignee, arbitrary link or full transcript is accepted.

## Atomic result and replay

The ERPNext database transaction owns uniqueness, scoped implicitly to the site and explicitly to `dodo` plus the UUID. It atomically creates one `DropOut Service Activity`, optionally one unassigned native `ToDo`, and a durable receipt on the activity. The receipt stores a SHA-256 hash of normalized JSON (UTF-8, recursively sorted ASCII property names, no whitespace, literal Unicode). Scalar text is preserved; omitted optional fields become null. Same key and normalized body returns the original receipt; different body is 409. Key rotation does not change the operation namespace. A failed transaction leaves neither an activity nor a ToDo.

The glue must pass the operation ID to ERPNext. It must not reserve and release a separate D1 `seen` key around the write. Transport failures remain uncertain; they never justify changing the operation ID. The receipt endpoint returns only committed operations, not an invented success for pending writes.

New POST is 201 `{ "data": receipt, "replayed": false }`; replay is 200 with the same receipt and `replayed: true`; GET is 200 `{ "data": receipt }`. Receipt fields: `schema_version: 1`, `source: "dodo"`, `operation_id`, lowercase hex `request_hash`, `state: "completed"`, `activity: { id, path }`, `handoff: { id, path } | null`, `committed_at` (UTC timestamp). Paths are server-generated relative Desk paths under `/app/`, not caller URLs. No contacts, summaries, credentials, arbitrary upstream body or stack trace leave via receipts. A completed receipt means the CRM records were committed; it does not mean someone has contacted the customer.

Expected errors use the existing public API envelope and request ID: 400 malformed request, 401 missing/revoked key, 403 insufficient scope, 404 absent operation or party, 409 changed payload for original key, 423 account locked, 429 rate limited, 502/503 unavailable or invalid upstream response. The server validates the receipt shape before advertising success.

## Acceptance evidence required

Automated checks must cover scope isolation, key rotation, sites, unknown fields, bounded bodies, receipt validation, duplicate and changed payloads, rollback after ToDo failure, concurrent duplicate writers and reading a receipt after the client loses a successful response. Native Frappe tests in the existing ERPNext CI job must exercise actual MariaDB transactions; mocks alone do not prove atomicity. A deployed tenant plus Dodo outbox, a real CRM receipt and an operator-openable case are still required for C07/live acceptance.

Both implementations use the same [synthetic normalization fixture](../frappe-apps/dropout_core/dropout_core/tests/fixtures/dodo-service-v1.json). It exercises Chinese text, emoji, newline/tab, literal markup, omitted optionals and empty optional text. Its canonical UTF-8 SHA-256 is `65e340981729bc6b9f38e19407a2b8a402d2591a3f48cf4fb7f4d3e50f140663`.

## Deployment and pilot handoff

1. Keep this change in review until the existing ERPNext CI job passes against real MariaDB. Unit tests of glue do not establish database atomicity.
2. On the selected non-production tenant, back up the site, install this `dropout_core` revision, and run `bench --site <site> migrate`. Deploy matching glue and web revisions through the existing release process. This branch has not deployed a site or changed a customer account.
3. Verify the existing backend integration user is enabled and explicitly has `DropOut Integration`. Reuse securely stored backend credentials; do not rerun `create_integration_user` just to inspect them, because that helper rotates its secret. Set the glue tenant's HTTPS ERPNext base and site name to this tenant only.
4. An authorized operator creates a dedicated Dodo key in Settings → API, selects Dodo customer-service records, and grants create permission only when the pilot can write. Store the one-time secret in Dodo server configuration; never in a client bundle, log or commit. Existing generic CRM keys keep their old privileges.
5. Confirm the nominated operator can open the new service activity and the linked native ToDo. The receiver creates an **unassigned** ToDo; an administrator must assign it through the existing CRM workflow. Sales User access to the service activity does not imply access to every unassigned ToDo. Assignment and responsibility must be demonstrated before accepting human follow-up.
6. Use synthetic records on that tenant first: create once, repeat the same operation, change its body, recover after a lost response, rotate the key, revoke the key, and lock/unlock writes. Confirm exact activity/ToDo counts in ERPNext, then open both records as the intended operator.
7. Connect Dodo's durable outbox to this contract. Only after a real Dodo record produces a verified CRM receipt and an operator can act on its ToDo can live synchronization be marked ready. No phone call, Google Calendar event or customer follow-up is implied by this receiver's receipt.

If a request times out, retain its exact normalized body and operation ID and query its receipt before retrying. If deployment is rolled back, retain already committed activities, ToDos and receipts; disabling new service writes is safer than deleting the evidence needed to recover uncertain operations.
