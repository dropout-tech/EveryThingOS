# 大整合：一次登入做完所有事

狀態：規劃稿，第 0 節待確認  
回答三個問題：

1. 現在的組合有沒有重複造輪子、有沒有更好的工具、有沒有更好的握法？
2. 加上開源會議紀錄機器人，要怎麼接進同一個客人？
3. 要實現這些還缺什麼？能不能全部用 Cloudflare？

與其他文件的關係：本文件修訂 [ARCHITECTURE.md](ARCHITECTURE.md) 的部署與膠水選擇、[FOUR-SYSTEMS-PLAN.md](FOUR-SYSTEMS-PLAN.md) 的 D3。確認後，兩份文件依本文件更新。

---

## 0. 待確認的決策

| # | 問題 | 建議 | 取代了什麼 |
| --- | --- | --- | --- |
| P1 | 產品殼要做多少畫面？ | **薄殼**：殼只做「今天、客人卡片、一鍵下一步、全域搜尋」；深度操作用單一登入跳進原系統（套 DropOut 皮） | 原本有往「殼重做每個系統畫面」走的趨勢 |
| P2 | 系統之間的同步用什麼？ | **Cloudflare Workers + Queues + Workflows** 寫固定的 G1–G10；Activepieces 延後到「客戶要自己拉自動化」時才上 | Activepieces 當第一期膠水 |
| P3 | 電子報第一期用什麼？ | **ERPNext 內建電子報與 Email Campaign**，寄送走 Amazon SES 或同級的外部寄信服務；客戶需要計分、視覺化序列時才為該客戶加 Mautic | 每家公司一套 Mautic + Postal |
| P4 | 員工登入用什麼？ | **ERPNext 當登入中心**（Frappe 可當 OAuth2／OpenID Connect 提供者），Cloudflare Access 只擋管理後台；Keycloak 延後 | 第一期就上 Keycloak |
| P5 | 會議紀錄怎麼做？ | **兩條路**：自家會議室用 Cloudflare RealtimeKit（內建錄音、會後逐字稿與摘要）；客戶開的 Google Meet／Teams／Zoom 用 Vexa 機器人 | 新增 |
| P6 | 部署在哪？ | **Cloudflare 當前門與膠水，一台主機跑重系統**，兩邊用 Cloudflare Tunnel 連；不硬塞全部上 Cloudflare | 原本未定 |
| P7 | 清庫第一期怎麼做？ | **雙重確認訂閱 + 退信自動停寄**；Reacher 延後 | 第一期就上 Reacher |

這七題確認後，第一期要自己架的系統從 11 套降到 4 套（ERPNext、Chatwoot、OpenReply、Vexa），其餘用 Cloudflare 或延後。

---

## 1. 重複造輪子檢查

### 1.1 有在重做別人已經做好的東西

| 位置 | 問題 | 改法 |
| --- | --- | --- |
| 殼的對話頁 | 若在殼裡重做收件匣（即時訊息、貼圖、附件、快捷回覆、指派），等於重寫 Chatwoot | 殼只顯示「誰在等你回」與客人卡片；按「回她」打開 Chatwoot 的那則對話。另外用 Chatwoot 的 Dashboard Apps 把**我們的客人卡片**嵌進 Chatwoot 側欄，兩邊看到同一個人 |
| 殼的電子報頁 | 若在殼裡做信件編輯器、分群編輯器，等於重寫 Mautic | 殼只做最常見的一條：寫一封、挑一個分群、看結果；進階一律開原系統 |
| 殼的 ERP 頁 | 簡化的「同一張單往下走」**值得自己做**，因為 ERPNext 原生畫面正是我們要藏的複雜度 | 保留，但只呼叫 ERPNext API，不在殼裡存任何帳 |
| 會計、稅表、報表 | 殼裡不要重做 | 直接開 ERPNext 對應頁面 |
| G1–G10 同步 | 用 Activepieces 畫 10 條固定流程，還要多養一套 Node + Postgres + Redis | 固定流程本來就是我們的程式；用 Cloudflare Workflows 寫，重試、排程、死信都是平台內建 |

### 1.2 同一件事有兩套系統

| 重疊 | 現在 | 建議 |
| --- | --- | --- |
| 登入 | Keycloak + ERPNext 各有帳號 | ERPNext 當唯一帳號來源（P4）；之後真的要接客戶自己的 Google Workspace／Microsoft 365 時，再評估 Keycloak 或 Cloudflare Access |
| 行銷名單與同意 | Mautic 與 ERPNext 各一份 | 第一期只有 ERPNext 一份（P3），退訂不會不同步 |
| 寄信 | Postal 與 Mautic 內建、之後還有交易信 | 交易信（出貨、發票、密碼）走 Cloudflare Email Service；電子報走外部寄信服務。不自架 Postal |
| Meta 連線 | OpenReply 與 Chatwoot 都接同一個粉專 | 維持分工：留言歸 OpenReply、私訊歸 Chatwoot；部署時驗證兩個 App 同時訂閱同一粉專的訊息歸屬 |
| 錄音轉文字 | Vexa 自帶 Whisper 要 GPU | 改接 Workers AI（見第 2 節），不買 GPU |

### 1.3 有更好的工具嗎

| 需求 | 原選擇 | 更好的選擇 | 為什麼 |
| --- | --- | --- | --- |
| 電子報（中小企業） | Mautic | ERPNext 內建電子報 → 需要時加 Mautic | Mautic 是一家公司一套，一百家客戶就是一百套 PHP + MySQL；ERPNext 一台主機可以開很多站 |
| 自動化膠水 | Activepieces | Cloudflare Workflows | 我們的流程是固定的，不需要拖拉畫布 |
| 檔案與錄音 | MinIO | Cloudflare R2 | 不用自己養物件儲存；ERPNext 附件與備份可寫 S3 相容儲存 |
| 交易信 | Postal | Cloudflare Email Service | 不用養 IP 信譽；但它只允許交易信 |
| 會議逐字稿 | 自架 GPU Whisper | Workers AI（Whisper Large v3 Turbo） | 依音訊分鐘計費，不閒置 |
| 對外網路 | 主機開公開埠 | Cloudflare Tunnel | 主機不開任何對外埠，WAF 與 TLS 在 Cloudflare |

### 1.4 沒有更好、維持原案的

| 系統 | 理由 |
| --- | --- |
| ERPNext | 台灣中小企業要的報價到收款、庫存、帳齡在社群版都有；換 Odoo 會撞到企業版的功能牆 |
| Chatwoot | 有 LINE、IG、FB、官網小工具通道，同一套就能服務多家公司（多帳戶） |
| OpenReply | IG／FB 留言關鍵字私訊沒有更成熟的開源替代 |
| Shlink | 仍是短網址最省事的選擇；但排到電子報跑通之後 |

### 1.5 更好的握法：殼只握三樣東西

```mermaid
flowchart TB
  subgraph shell [DropOut OS 殼]
    Today[今天：一件事]
    Card[客人卡片：360 時間軸]
    Search[全域搜尋]
  end
  subgraph deep [深度操作：單一登入跳過去、套皮]
    CW[Chatwoot 對話]
    EN[ERPNext 帳與報表]
    MT[Mautic 進階行銷，選配]
  end
  Today --> Card
  Card -->|回她| CW
  Card -->|看帳| EN
  Card -->|進階行銷| MT
  CW -->|側欄嵌入| Card
```

員工每天的路：打開「今天」→ 點一件事 → 看到這個客人的卡片 → 按一個按鈕。按鈕如果需要完整工具（回訊息、對帳），就在同一個登入裡打開那個工具的那一頁。**殼不跟原系統比功能多，只負責「下一件事是什麼、這個人是誰」。**

---

## 2. 會議紀錄機器人

### 2.1 選項

| 專案 | 授權 | 會議平台 | 轉文字 | 適合 |
| --- | --- | --- | --- | --- |
| [Vexa](https://github.com/vexa-ai/vexa) | Apache-2.0 | Google Meet、Teams、Zoom（Jitsi 尚在驗證） | 可接任何 OpenAI 相容的轉文字端點；自帶的 faster-whisper 要 GPU，CPU 版較慢 | **建議**：機器人進客戶的會議 |
| [Cloudflare RealtimeKit](https://developers.cloudflare.com/realtime/realtimekit/) | 託管服務（非開源） | 自家會議室 | 會後 Whisper Large v3 Turbo 逐字稿 + AI 摘要，內建 | **建議**：我們自己發會議連結時 |
| [MeetingBot](https://github.com/meetingbot/meetingbot) | LGPL-3.0 | Meet、Teams、Zoom | 只錄音，轉文字另接 | 候選；部署綁 AWS Terraform |
| [Attendee](https://github.com/attendee-labs/attendee) | Elastic License 2.0 | Meet、Teams、Zoom | 接外部服務 | **不用**：不允許代管給第三方，跟我們賣給其他公司衝突 |
| [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) | MIT | 不進會議，本機錄 | 本機 Whisper | 候選：實體會議用筆電錄 |

### 2.2 員工看到什麼

1. 在客人卡片或「今天」按**記這場會**，貼上會議連結（或按**開一間會議室**，產生我們自己的會議連結）
2. 機器人以「DropOut 會議紀錄」名稱加入，並在會議聊天室宣告正在記錄
3. 會議結束後，客人卡片時間軸多一筆：摘要、決定事項、待辦（誰、什麼時候）
4. 待辦變成 ERPNext 的 ToDo，指派給負責人，出現在他的「今天」
5. 若摘要提到報價或數量，卡片上出現「要不要開報價」按鈕；**不自動開單**

### 2.3 資料流

```mermaid
flowchart LR
  Card[客人卡片：記這場會] --> W[Worker：建立會議任務]
  W -->|外部會議| V[Vexa 機器人]
  W -->|自家會議室| RK[RealtimeKit]
  V -->|音訊| STT[Worker：轉文字轉接]
  STT --> WAI[Workers AI Whisper]
  RK -->|meeting.transcript／meeting.summary webhook| Sum
  WAI --> Sum[Worker：摘要＋待辦]
  Sum --> CC[OpenCC 轉繁體]
  CC --> R2[R2：逐字稿原檔]
  CC --> EN[ERPNext：時間軸＋ToDo]
```

- 新事件：`meeting_recorded`（帶 `party_id`、會議時間、逐字稿 R2 位置）、`meeting_summarized`（帶摘要與待辦）
- Vexa 的轉文字端點指向我們的 Worker；Worker 把 OpenAI 相容格式的請求轉成 Workers AI 呼叫。這是約百行的轉接層，不是自研轉文字
- Whisper 輸出中文可能是簡體，存檔前一律用 OpenCC（Apache-2.0）轉成台灣繁體
- RealtimeKit 的逐字稿與摘要只保留 7 天，收到 webhook 後要立刻搬到 R2

### 2.4 規則與風險

| 項目 | 規則 |
| --- | --- |
| 告知與同意 | 機器人必須用明顯名稱加入並宣告；客人卡片記錄「已告知錄音」。客戶要求停止就立刻離開 |
| 誰能派機器人 | 只有該客人的負責人與主管 |
| 保存 | 逐字稿原檔與錄音依公司設定的天數自動刪除；摘要跟著客人主檔 |
| Zoom | 機器人加入 Zoom 需要 Zoom App 憑證與審核 |
| Google Meet | 機器人以訪客加入，需要主持人放行 |
| 台語、口音 | Whisper 對台語效果差；畫面上標示「逐字稿僅供參考」，摘要讓負責人確認後才進時間軸 |
| 摘要品質 | 繁體中文摘要要先用真實會議錄音挑模型，不在沒測過前承諾品質 |

---

## 3. 能不能全部用 Cloudflare？

**不能全部，但可以讓 Cloudflare 承擔七成：前門、登入關卡、膠水、檔案、交易信、AI、自家會議室。** 有狀態的大系統放一台主機，經 Cloudflare Tunnel 接進來。

### 3.1 逐項判斷

| 元件 | 放 Cloudflare？ | 用什麼 | 理由 |
| --- | --- | --- | --- |
| DropOut 產品殼（Next.js） | ✅ | Workers（OpenNext Cloudflare adapter） | 搬遷前要先驗證 Next.js 16 能在 adapter 上 build；現在部署在 Vercel |
| DNS、TLS、WAF、防機器人 | ✅ | Cloudflare 原生 | |
| 管理後台的登入關卡 | ✅ | Cloudflare Access | 免費方案 50 人，超過按人計費 |
| Webhook 接收與驗簽 | ✅ | Workers | LINE、Meta、金流、Chatwoot、ERPNext 的通知都先進這裡 |
| 同步 G1–G10 | ✅ | Queues + Workflows | 重試、排程、死信內建 |
| 冪等鍵、死信清單 | ✅ | D1 | 只放膠水狀態，不放業務資料 |
| 檔案、錄音、備份 | ✅ | R2 | |
| 交易信 | ✅ | Email Service（需 Workers 付費方案） | **只能交易信**，不能寄電子報 |
| 收信（客服信箱轉對話） | ✅ | Email Routing → Worker → Chatwoot | |
| 會議逐字稿、摘要 | ✅ | Workers AI | |
| 自家會議室 | ✅ | RealtimeKit | 非開源託管服務 |
| ERPNext | ❌ | 主機 Docker | 需要 MariaDB、Redis、背景工作與排程常駐；Cloudflare 沒有 MariaDB，容器磁碟不保留 |
| Chatwoot | ❌ | 主機 Docker | Rails + Sidekiq + Postgres + Redis + WebSocket 常駐；Cloudflare 沒有託管 Redis |
| OpenReply | ⚠️ | 先放主機 | 是否能改跑在 Workers 要看程式結構，部署時評估 |
| Vexa | ❌ | 主機 Docker | 每場會議一個 Chromium 容器，由 Vexa 自己的 Docker／Kubernetes 調度；轉文字改走 Workers AI 就不需要 GPU |
| 電子報群發 | ❌ | 外部寄信服務（如 Amazon SES） | Cloudflare Email Service 禁止行銷群發；自架 Postal 需要 25 埠與 IP 信譽，Cloudflare 做不到 |
| Mautic（選配） | ❌ | 主機 Docker | PHP + MySQL + 排程常駐 |
| Reacher（延後） | ❌ | 主機 | 要從 25 埠探測對方郵件伺服器 |

Cloudflare 容器（Containers）已經正式提供，但磁碟在睡眠或重啟後會回到映像檔狀態，快照最多保留 30 天。它適合**無狀態、可隨時重來**的工作，不適合當 ERPNext、Chatwoot 這種要 24 小時常駐又自帶資料庫的系統。

### 3.2 建議的部署圖

```mermaid
flowchart TB
  subgraph cf [Cloudflare]
    Shell[DropOut 殼 Workers]
    Access[Access 管理後台關卡]
    Hooks[Webhook Workers]
    Q[Queues + Workflows]
    D1[(D1 膠水狀態)]
    R2[(R2 檔案錄音備份)]
    Mail[Email Service 交易信]
    AI[Workers AI]
    RK[RealtimeKit 會議室]
    Tunnel[Tunnel]
  end
  subgraph host [一台主機 Docker Compose]
    ERP[ERPNext 多站]
    CW[Chatwoot 多帳戶]
    OR[OpenReply]
    VX[Vexa]
  end
  Ext[LINE／Meta／金流／加值中心] --> Hooks
  Hooks --> Q
  Q --> D1
  Q --> Tunnel
  Shell --> Tunnel
  Tunnel --> ERP
  Tunnel --> CW
  Tunnel --> VX
  VX --> AI
  RK --> Q
  ERP -->|備份| R2
  Q --> Mail
```

主機不開任何對外埠；所有流量經 Tunnel。主機掛掉時，殼與 webhook 仍在 Cloudflare 收件、排隊，恢復後補送。

### 3.3 如果堅持「全部 Cloudflare」要付的代價

只有一條路：放棄 ERPNext 與 Chatwoot，在 Workers + D1／PlanetScale 上自己寫 CRM、ERP、收件匣。這正是本專案明文禁止的「自研 CRM／ERP 資料模型」，而且要自己重做會計、庫存、稅、LINE 與 Meta 連線。**不建議。**

---

## 4. 要實現這些，還缺什麼

### 4.1 帳號與合約（要由公司申請）

| 項目 | 用途 | 卡住哪一期 |
| --- | --- | --- |
| Cloudflare 帳號、Workers 付費方案、網域託管在 Cloudflare | 殼、膠水、交易信、AI | 全部 |
| 一台主機（示範站粗估 8 vCPU／32 GB，正式規格待壓測） | ERPNext、Chatwoot、OpenReply、Vexa | 接 ERPNext 起 |
| LINE 官方帳號 Messaging API | 對話 | 對話真的 |
| Meta 開發者 App 與 App Review | IG／FB 私訊與留言 | 社群 |
| 外部寄信服務帳號與寄件網域 DNS | 電子報 | 電子報真的 |
| Zoom App 憑證 | 機器人進 Zoom | 會議（只有 Zoom 需要） |
| 電子發票加值中心合約 | 開立發票 | 發票 |
| 金流商合約 | 收款 | 金流 |

### 4.2 工程工作包

| # | 工作包 | 內容 | 依賴 |
| --- | --- | --- | --- |
| W1 | 殼搬上 Cloudflare | OpenNext adapter、環境變數、Access 擋 `/admin` | Cloudflare 帳號 |
| W2 | 資料來源層 | `web/lib/sources` demo／live 切換（見四系統規劃第 6 節） | 無 |
| W3 | 主機與 Tunnel | Docker Compose：ERPNext、Chatwoot；Tunnel；每日備份到 R2；還原演練 | 主機 |
| W4 | ERPNext 登入中心 | Frappe OAuth2／OIDC 提供者；殼、Chatwoot 用它登入 | W3 |
| W5 | Webhook 與膠水 | Workers 驗簽、Queues、Workflows、D1 冪等；G1–G10 | W3 |
| W6 | 客人 360 | 身分表、事件表、時間軸 API；Chatwoot 側欄嵌入客人卡片 | W4、W5 |
| W7 | 電子報 | ERPNext 電子報 + 外部寄信；雙重確認訂閱；退信回寫 | W5 |
| W8 | 會議紀錄 | Vexa 部署、Worker 轉文字轉接、RealtimeKit、OpenCC、摘要寫回 | W5、W6 |
| W9 | 開新公司 | 一個指令建 ERPNext 站 + Chatwoot 帳戶 + 預設流程 + 產業包 | W3、W4 |
| W10 | 台灣在地 | 電子發票、金流、LINE 推播（同意後） | W5、合約 |

W1、W2 不需要任何外部帳號，可以先做。

### 4.3 維運（容易被忽略）

- **備份與還原**：每日備份到 R2，每個月實際還原一次到測試站
- **升級**：ERPNext、Chatwoot、Vexa 各有大版本；升級先在測試站跑
- **監控**：主機資源、佇列堆積、死信數量；異常出現在管理員的「今天」
- **祕密**：所有 token 放 Workers secrets 與主機環境變數，不進 git

### 4.4 法遵

- 個資法：同意紀錄、查詢、刪除一次刪全部系統（含錄音與逐字稿）
- 錄音：機器人宣告、可隨時要求離開、保存期限
- 授權：ERPNext GPL-3；Frappe CRM／Helpdesk、Mautic 等 AGPL／GPL 若修改並對外提供服務，要公開修改；Vexa Apache-2.0；Chatwoot 只用社群版功能

---

## 5. 「登入後做所有事」的範圍

一次做完全部會讓第一期永遠做不完。依「沒有它，員工就得再開另一套工具」排序：

| 能力 | 用什麼 | 時機 |
| --- | --- | --- |
| 今天、客人卡片、搜尋 | DropOut 殼 | 第一期 |
| 報價到收款、進貨、庫存、帳 | ERPNext | 第一期 |
| 對話（LINE、IG、FB、官網） | Chatwoot + OpenReply | 第一期 |
| 電子報 | ERPNext 內建 → 選配 Mautic | 第一期 |
| 會議紀錄 | Vexa + RealtimeKit | 第一期尾 |
| 官網、落地頁 | Frappe Builder | 第二期 |
| 短網址 | Shlink | 第二期 |
| 報表 | Frappe Insights | 第二期 |
| 簽約 | DocuSeal 或 Documenso（皆 AGPL） | 有客戶要求時 |
| 內部溝通 | 多數台灣團隊已用 LINE 群組；真的需要再評估 Frappe Raven | 不排 |
| 人事、薪資、勞健保 | Frappe HR 沒有台灣勞健保；不做 | 非目標 |
