# 對外 API 與 Webhook

讓公司自己的其他系統接進 EveryThingOS：蝦皮／momo 的串接程式、會計師事務所的匯出、自己寫的 App、Zapier、n8n、Make。

- **API**：別的系統來讀客人、商品、訂單、發票，或新增客戶與潛在客人
- **Webhook**：有新訂單、開了發票、收到錢時，DropOut 主動通知別的系統

資料一樣以 ERPNext 為準（[ARCHITECTURE.md](ARCHITECTURE.md) 第 5 節）。API 只是一扇窄門：欄位與篩選都是固定的清單，不會把任意查詢轉給 ERPNext。機器可讀的規格在 [openapi.yaml](openapi.yaml)。

## 怎麼開金鑰、設 Webhook

老闆（ERPNext 的 System Manager）登入殼 → **設定** → **對外 API 與 Webhook**（`/workspace/settings/api`）。

| 東西 | 規則 |
| --- | --- |
| API 金鑰 | `dok_live_` 開頭，只在開的時候出現一次；我們只存 SHA-256，畫面上只看得到前幾碼（例：`dok_live_3f9a1c…`）。弄丟了就停用再開一把 |
| 權限 | `read`（只能讀）或 `read` + `write`（也能新增客戶、潛在客人） |
| 數量 | 每家公司最多 10 把有效金鑰、5 個 Webhook |
| 誰能管 | 只有 System Manager；開、停用都記在公司歷史（營運後台看得到） |

金鑰綁一家公司。請求裡不需要、也不能指定公司：**公司一律從金鑰判斷**。

## API

```
https://<膠水網址>/v1
Authorization: Bearer dok_live_…
```

金鑰只能放在伺服器端（例如 n8n、自己的後端），不要放進網頁或 App 安裝檔。API 沒有開 CORS，瀏覽器直接呼叫會被擋。

### 端點

| 方法 | 路徑 | 權限 | 做什麼 |
| --- | --- | --- | --- |
| `GET` | `/v1/customers` | read | 客戶 |
| `POST` | `/v1/customers` | write | 新增客戶 |
| `GET` | `/v1/items` | read | 商品 |
| `GET` | `/v1/sales-orders` | read | 訂單 |
| `GET` | `/v1/invoices` | read | 銷項發票 |
| `POST` | `/v1/leads` | write | 新增潛在客人 |

### 讀：分頁與篩選

所有 `GET` 都一樣：

| 參數 | 說明 |
| --- | --- |
| `limit` | 1–100，預設 20 |
| `offset` | 0–10000，預設 0 |
| `order` | `-modified`（新到舊，預設）或 `modified`（舊到新，做增量同步用這個） |
| `modified_since` | ISO 8601，例：`2026-10-01T00:00:00+08:00`。沒寫時區就當台灣時間 |

各自多的篩選：

| 路徑 | 篩選 | 回傳欄位 |
| --- | --- | --- |
| `/v1/customers` | `q`（名稱包含）、`tax_id`（8 碼統編） | `id`、`customer_name`、`customer_type`、`customer_group`、`territory`、`tax_id`、`email_id`、`mobile_no`、`disabled`、`creation`、`modified` |
| `/v1/items` | `q`（品名包含）、`item_group` | `id`、`item_code`、`item_name`、`item_group`、`stock_uom`、`is_stock_item`、`disabled`、`description`、`modified` |
| `/v1/sales-orders` | `customer`、`status` | `id`、`customer`、`customer_name`、`transaction_date`、`delivery_date`、`grand_total`、`currency`、`status`、`per_delivered`、`per_billed`、`docstatus`、`modified` |
| `/v1/invoices` | `customer`、`status` | `id`、`customer`、`customer_name`、`posting_date`、`due_date`、`grand_total`、`outstanding_amount`、`currency`、`status`、`is_return`、`dropout_einvoice_number`、`docstatus`、`modified` |

`status` 用 ERPNext 原本的值：訂單 `Draft`、`On Hold`、`To Deliver and Bill`、`To Bill`、`To Deliver`、`Completed`、`Cancelled`、`Closed`；發票 `Draft`、`Return`、`Credit Note Issued`、`Submitted`、`Paid`、`Partly Paid`、`Unpaid`、`Overdue`、`Cancelled`。`docstatus`：0 草稿、1 已送出、2 已取消。時間欄位是台灣時間 `YYYY-MM-DD HH:MM:SS`。

不認得的參數、同一個參數給兩次、格式不對，一律 400，不會「忽略後照跑」。

```bash
curl -s "https://glue.example.tw/v1/sales-orders?status=To%20Bill&limit=50&order=modified&modified_since=2026-10-01" \
  -H "Authorization: Bearer $DROPOUT_KEY"
```

```json
{
  "data": [{ "id": "SAL-ORD-2026-00031", "customer": "安安商行", "grand_total": 10500, "status": "To Bill", "modified": "2026-10-11 10:02:11" }],
  "has_more": true,
  "next_offset": 50
}
```

`has_more` 是 `true` 就用 `next_offset` 拿下一頁。增量同步建議：記下最後一筆的 `modified`，下次用 `order=modified&modified_since=<那個時間>`，自己用 `id` 去重。

### 寫：新增客戶

```bash
curl -s https://glue.example.tw/v1/customers \
  -H "Authorization: Bearer $DROPOUT_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: shopee-buyer-88123" \
  -d '{"customer_name":"安安商行","tax_id":"22099131","email":"boss@anan.tw","phone":"02-2345-6789"}'
```

| 欄位 | 規則 |
| --- | --- |
| `customer_name` | 必填，最多 140 字 |
| `customer_type` | `Company`（預設）或 `Individual` |
| `tax_id` | 8 碼數字；台灣站會再驗檢查碼。同統編已經有客戶 → 409，`existing_id` 是那位客戶 |
| `email`、`phone` | 選填；會記成這位客戶的聯絡方式 |

成功回 201 和新客戶（欄位同 `GET /v1/customers`）。客戶群組、地區用 ERPNext「銷售設定」的預設值。

### 寫：新增潛在客人

```bash
curl -s https://glue.example.tw/v1/leads \
  -H "Authorization: Bearer $DROPOUT_KEY" -H "Content-Type: application/json" \
  -d '{"name":"林安安","email":"anan@example.com","company_name":"安安商行","notes":"momo 詢問大量訂購"}'
```

| 欄位 | 規則 |
| --- | --- |
| `name`、`email`、`phone` | 至少填一個 |
| `company_name` | 選填，最多 140 字 |
| `notes` | 選填，最多 2000 字，會變成這位潛在客人的留言 |

跟殼裡「新增客人」同一個動作：同一個 Email 或電話已經認識的人，回 200 和 `"existing": true`，不會重複建。新的回 201。

```json
{ "data": { "id": "CRM-LEAD-2026-00042", "party_type": "Lead", "existing": false } }
```

### 重送不重複：Idempotency-Key

`POST` 可以帶 `Idempotency-Key`（8–100 個英數字、`_ . : -`）。同一把金鑰用過的 key 再送一次回 409 `idempotency_key_reused`，不會再建一筆。ERPNext 沒成功（4xx／5xx）的那次不算用過，可以放心重試。保留 180 天。

### 欄位白名單

`POST` 的內容只接受上面列的欄位；多一個（例如 `owner`、`docstatus`）就 400。內容最多 16 KB，`Content-Type` 必須是 `application/json`。

### 合約到期、暫停

公司合約變成「只能看」、暫停或解約時，所有寫入回 **423** `account_locked`，`message` 寫原因（跟殼上方的提示一樣）。讀取照常，資料可以繼續匯出。

### 錯誤

格式都一樣：

```json
{ "error": { "code": "invalid_request", "message": "limit 要是 1–100 的整數", "field": "limit", "request_id": "6f1c…" } }
```

| HTTP | `code` | 什麼時候 |
| --- | --- | --- |
| 400 | `invalid_request` | 參數或內容不對；`field` 指出哪一個 |
| 401 | `unauthorized` | 沒帶金鑰、金鑰不對、已停用 |
| 403 | `insufficient_scope` | 只能讀的金鑰想寫 |
| 404 | `not_found` | 沒有這個路徑 |
| 405 | `method_not_allowed` | 方法不對；`Allow` 標頭寫可以用的 |
| 409 | `conflict` | 同統編客戶已存在（附 `existing_id`） |
| 409 | `idempotency_key_reused` | `Idempotency-Key` 用過了 |
| 422 | `erpnext_rejected` | ERPNext 依規則拒絕（例：統編檢查碼不對），`message` 是 ERPNext 的原因 |
| 423 | `account_locked` | 合約只能看／暫停／解約，不能寫 |
| 429 | `rate_limited` | 太快了；看 `Retry-After` |
| 502 | `erpnext_unavailable` | ERPNext 連不到或 5xx，稍後重試 |
| 502 | `erpnext_error` | ERPNext 回了我們看不懂的東西，或整合帳號權限有問題；請聯絡 DropOut |
| 503 | `not_configured` | 這家公司還沒接上 ERPNext |

回應都帶 `X-Request-Id`，找我們時附上這個。ERPNext 的原始錯誤（可能有程式內部資訊）不會傳出去。

### 速率限制

每把金鑰每分鐘 120 次；超過回 429 與 `Retry-After: 60`。用錯金鑰也算：同一個 IP 一分鐘內失敗 120 次後先擋一分鐘。

用的是 Cloudflare Workers 的 Rate Limiting binding（`API_LIMIT`，見 `glue/wrangler.jsonc`）。它是每個 Cloudflare 機房各自計數、最終一致，所以是「防暴衝」而不是精準計費，正好是這裡要的：不用為了計數多一次 D1 寫入。本機開發與測試沒有這個 binding 時，退回每個 Worker 執行個體自己的一分鐘固定視窗。

## Webhook

### 事件

| 事件 | 什麼時候 | 來自 ERPNext 的 DropOut Event |
| --- | --- | --- |
| `customer.created` | 新客戶建檔（殼、Desk、API、匯入都算） | `customer_created` |
| `lead.created` | 新的潛在客人（官網表單、對話、殼、API 都算） | `lead_created` |
| `quote.sent` | 報價單送出 | `quote_sent` |
| `sales_order.submitted` | 訂單成立 | `won` |
| `delivery.submitted` | 出貨單送出 | `fulfilled` |
| `invoice.submitted` | 銷項發票送出 | `invoiced` |
| `payment.received` | 收到客戶的款項（Payment Entry 收款） | `paid` |

不是另一條管線：ERPNext 每一筆 DropOut Event 本來就經 Frappe Webhook 送到膠水（`/erpnext/events`），膠水的佇列在處理時順便發給有訂這個事件的 Webhook。同一個事件對同一個 Webhook 只會排一次。

### 內容

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: DropOut-Webhooks/1
X-DropOut-Event: sales_order.submitted
X-DropOut-Delivery: evt_DOEV-2026-00981
X-DropOut-Signature: t=1760148000,v1=5d2c…

{
  "id": "evt_DOEV-2026-00981",
  "type": "sales_order.submitted",
  "created_at": "2026-10-11T02:00:00.000Z",
  "data": { "doctype": "Sales Order", "id": "SAL-ORD-2026-00031", "party_type": "Customer", "party": "安安商行", "amount": 10500, "currency": "TWD" }
}
```

`data` 只有參照和金額，完整資料用 API 去拿（`GET /v1/sales-orders?customer=…`）。同一個事件重試時 `id` 不變，請用它去重。另外有 `type: "ping"`，是設定頁「送測試」發的。

### 驗證簽章

`X-DropOut-Signature: t=<UNIX 秒>,v1=<hex>`，`v1 = HMAC-SHA256(簽章密鑰, "<t>.<原始 body>")`。

1. 用**原始** body（不要先 parse 再 stringify）
2. 檢查 `t` 跟現在差不超過 5 分鐘，擋重放
3. 用固定時間比較（`timingSafeEqual`／`compare_digest`）

Node.js：

```js
import crypto from "node:crypto";

export function verifyDropOut(secret, header, rawBody, toleranceSeconds = 300) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.trim().split("=", 2)));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express：一定要拿原始 body
app.post("/dropout", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifyDropOut(process.env.DROPOUT_WEBHOOK_SECRET, req.get("x-dropout-signature"), req.body.toString("utf8"))) return res.sendStatus(401);
  const event = JSON.parse(req.body);
  // 用 event.id 去重，再處理
  res.sendStatus(204);
});
```

Python：

```python
import hashlib
import hmac
import time


def verify_dropout(secret: str, header: str, raw_body: bytes, tolerance: int = 300) -> bool:
    parts = dict(p.strip().split("=", 1) for p in (header or "").split(",") if "=" in p)
    try:
        t = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))


# Flask
@app.post("/dropout")
def dropout():
    if not verify_dropout(os.environ["DROPOUT_WEBHOOK_SECRET"], request.headers.get("X-DropOut-Signature"), request.get_data()):
        abort(401)
    event = request.get_json()
    return "", 204
```

Zapier／Make／n8n 沒辦法驗簽時，至少把網址當密碼保管（Zapier 的 catch hook 網址本身就是祕密）。

### 送不到怎麼辦

| 情況 | 處理 |
| --- | --- |
| 回 2xx | 算送到 |
| 其他狀態碼、10 秒沒回應、連不到 | 算失敗，經佇列在 30、60、120 秒後重試，共 4 次；還是不行就進「系統同步」的卡住清單，可以按重送 |
| 3xx 轉址 | 不跟，算失敗（避免被轉去內部網路） |
| 連續 20 次失敗 | Webhook 自動停用，設定頁寫原因，公司歷史記一筆；修好後按「重新啟用」，失敗次數歸零 |

每個 Webhook 保留最近 50 筆送出紀錄（狀態碼、耗時、第幾次），設定頁看得到最近 10 筆。對方回的內容不存。

### 網址限制（SSRF）

- 只接受 `https://`；網址不能帶帳號密碼
- 不能是 IP 位址落在本機、私有網段、CGNAT、link-local（含雲端 metadata `169.254.169.254`）、multicast；IPv6 只接受網域名稱
- 不能是 `localhost`、`.local`、`.internal` 等內部名稱或沒有點的主機名稱
- 不能送回 DropOut 自己的系統（膠水、這家公司的 ERPNext、Chatwoot、Vexa）
- 新增時與每次送出前都用 DNS-over-HTTPS（1.1.1.1）查一次，指到內部位址就拒絕

## 實作位置

| 檔案 | 做什麼 |
| --- | --- |
| `glue/migrations/0005_public_api.sql` | `api_keys`、`webhooks`、`webhook_deliveries` |
| `glue/src/publicApi.ts` | `/v1/*`、金鑰驗證、速率限制、金鑰管理 |
| `glue/src/webhooks.ts` | 事件對照、簽章、網址檢查、發送、自動停用、Webhook 管理 |
| `glue/src/jobs.ts` | `erpnext_event` 時呼叫 `fanOut`；`webhook` 工作 |
| `frappe-apps/dropout_core/dropout_core/events.py` | `customer_created`、`lead_created` |
| `frappe-apps/dropout_core/dropout_core/public_api.py` | `create_customer` |
| `web/app/workspace/settings/api` | 設定頁；`web/app/api/integrations/*` 轉給膠水 |

殼用 `SHELL_TOKEN` 呼叫膠水的 `/admin/tenants/<site>/api-keys`、`/admin/tenants/<site>/webhooks`；`<site>` 是殼依網址查到的那一家，殼在伺服端先確認登入的人是 System Manager。`SHELL_TOKEN` 仍然碰不到合約、公司設定與任何金鑰明文。

## 目前不做

- 單筆查詢（`GET /v1/customers/<id>`）、修改、刪除；報價、出貨、收款的寫入
- 金鑰到期日、IP 白名單、只限某些端點的權限
- Webhook 簽章密鑰輪替（現在是刪掉重建）、自訂重試次數
- OAuth（給第三方 App 上架用）；現在只有公司自己開的金鑰
