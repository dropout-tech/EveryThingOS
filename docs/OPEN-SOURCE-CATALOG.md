# EveryThingOS 開源盤點

本文件回答：「這些東西開源界已經有什麼、我們要不要納進來。」  
授權以各專案當下 `LICENSE` 為準；這裡只作架構取捨，不取代法務審查。

圖例：

- **建議採用**：第一期就組進來
- **候選**：有明確需求再上
- **暫緩**：會讓「一個工具」變複雜，或授權不適合當產品核心
- **不用**：看起來像開源、實際會卡住商業化或維運

---

## 1. ERP（進銷存、財務、採購、製造、專案）

| 專案 | 授權 | 定位 | 決定 |
| --- | --- | --- | --- |
| [ERPNext](https://github.com/frappe/erpnext) | GPL-3.0 | 完整 ERP：會計、庫存、BOM、HR、專案都在社群版 | **建議採用（核心 SoR）** |
| [Frappe Framework](https://github.com/frappe/frappe) | MIT | ERPNext 的底層；自建 DocType 成本低 | **建議採用** |
| [Odoo Community](https://github.com/odoo/odoo) | LGPL-3.0 | 模組最廣、介面較現代；完整會計／工作室多在 Enterprise | 候選（若接受 Community 功能邊界） |
| [Dolibarr](https://github.com/Dolibarr/dolibarr) | GPL-3.0 | 輕量 SME ERP/CRM | 小團隊、低複雜度時候選 |
| [Tryton](https://www.tryton.org/) | GPL-3.0 | 嚴謹 ERP，學習曲線陡 | 暫緩 |
| [LedgerSMB](https://github.com/ledgersmb/LedgerSMB) | GPL-2.0 | 會計強、其他弱 | 暫緩 |
| SAP / NetSuite / Dynamics | 專有 | — | **不用** |

**為什麼預設 ERPNext，而不是 Odoo：**  
EveryThingOS 的前提是「全部開源、一個工具」。Odoo 的進階會計、Studio、部分行銷與行動 App 落在專有 Enterprise，之後很容易被迫付費或自己重做。ERPNext 的會計與庫存在 GPL 社群版就是完整的，比較符合本專案宣言。

---

## 2. CRM（名單、商機、管道、活動）

| 專案 | 授權 | 定位 | 決定 |
| --- | --- | --- | --- |
| ERPNext CRM 模組 | GPL-3.0 | 與訂單、應收、庫存同一張客戶主檔 | **建議採用（主檔）** |
| [Frappe CRM](https://github.com/frappe/crm) | AGPL-3.0 | 較現代的管道介面，可跟 ERPNext 同生態 | 候選（業務人員強烈需要現代 pipeline 時） |
| [Twenty](https://github.com/twentyhq/twenty) | AGPL-3.0 | Salesforce 風格、AI 優先 | 暫緩：與 ERP 主檔重疊 |
| [EspoCRM](https://github.com/espocrm/espocrm) | AGPL-3.0 | 輕量、好自架 | 暫緩 |
| [SuiteCRM](https://github.com/salesagility/SuiteCRM) | AGPL-3.0 | 功能很全、介面偏舊 | 暫緩 |
| [CiviCRM](https://github.com/civicrm/civicrm-core) | AGPL-3.0 | 非營利／會籍 | 除非目標客群是 NGO |
| Vtiger Open Source | MPL-2.0 | Open core，雲端功能分家 | 暫緩 |

原則：**不要同時養兩套 CRM。** 客戶、公司、統編只存在 ERPNext。Frappe CRM 若採用，只能當 ERPNext 的前台，不能當第二個真相來源。

---

## 3. 魅力圈／行銷漏斗（Landing、磁鐵、序列、計分）

「魅力圈」在實務上不是單一軟體，而是一條吸引力行銷閉環：

1. 吸引（內容、廣告、短連結）
2. 捕捉（落地頁 + 表單 + 清庫）
3. 養成（信件／LINE 序列、計分、分群）
4. 變現（報價、結帳、訂閱）
5. 內圈（會員、社群、續購、介紹）

| 專案 | 授權 | 對應步驟 | 決定 |
| --- | --- | --- | --- |
| [Mautic](https://github.com/mautic/mautic) | GPL-3.0 | 表單、落地頁（GrapesJS）、活動畫布、計分、分群、信件／簡訊 | **建議採用（漏斗大腦）** |
| [Frappe Builder](https://github.com/frappe/builder) | AGPL-3.0 | 視覺化建站／落地頁，跟 ERPNext 同帳 | **建議採用（頁面外觀）** |
| [Listmonk](https://github.com/knadh/listmonk) | AGPL-3.0 | 大量電子報，極強、極單純 | 候選：只要電子報、不要自動化時可取代 Mautic 的寄信面 |
| [GrapesJS](https://github.com/GrapesJS/grapesjs) | BSD-3 | 編輯器本體，Mautic 已內建 | 不單獨部署 |
| [Keila](https://github.com/pentacent/keila) | AGPL-3.0 | 輕量電子報 | 暫緩 |
| [Formbricks](https://github.com/formbricks/formbricks) | AGPL-3.0 | 問卷與產品調查 | 候選 |
| [Cal.com](https://github.com/calcom/cal.com) | AGPL-3.0 | 預約／諮詢檔期 | 候選（高票漏斗需要「約諮詢」時） |
| [BigBlueButton](https://github.com/bigbluebutton/bigbluebutton) | LGPL-3.0 | 網路研討會 | 候選 |
| [Jitsi Meet](https://github.com/jitsi/jitsi-meet) | Apache-2.0 | 視訊會議 | 候選 |
| [Discourse](https://github.com/discourse/discourse) | GPL-2.0 | 會員社群／內圈 | 第二期候選 |
| ClickFunnels / Kartra / 自製頁面編輯器 | 專有或自研 | — | **不用**（第一期禁止自研漏斗引擎） |

Odoo 社群版也有網站與大量郵件，但自動化深度明顯不如 Mautic。要「一個工具」的體驗，做法是 **SSO + 嵌入／跳轉**，不是把 Mautic 功能重寫進 ERP。

---

## 4. 名單清庫（垃圾清庫）

清庫不是「刪掉看起來像垃圾的信箱」，而是在進漏斗、進 CRM 之前，把**語法錯誤、拋棄式、不存在、角色帳號、catch-all、已知垃圾陷阱**標出來，保護寄信聲譽。

| 專案 | 授權 | 能力 | 決定 |
| --- | --- | --- | --- |
| [Reacher](https://github.com/reacherhq/backend) / [check-if-email-exists](https://github.com/reacherhq/check-if-email-exists) | AGPL-3.0 | 語法、MX、SMTP、catch-all、拋棄式；REST API | **建議採用** |
| [Truemail](https://github.com/truemail-rb/truemail) | MIT | Ruby 驗證器，可當微服務 | 候選 |
| [Verifio](https://github.com/verifio-email/verifio) | MIT | ZeroBounce 風格自架 API | 候選 |
| NeverBounce / ZeroBounce / Emailable | 專有 SaaS | — | 僅在自架 SMTP 探測被目標郵件商封鎖時當備援 |

清庫必須做成**同步閘道 + 批次工作**：

- 表單送出當下：語法 + MX + 拋棄式（要快）
- 夜間批次：SMTP 探測、角色帳號、歷史退信回寫
- 結果寫回 Mautic 聯絡人與 ERPNext 潛在客戶，而不是另存一份名單庫

**不做自己的檢查器。** 探測郵件伺服器是專業問題（greylist、catch-all、法律與反濫用），用 Reacher。

---

## 5. 網址連結追蹤（短網址、UTM、點擊情報）

| 專案 | 授權 | 能力 | 決定 |
| --- | --- | --- | --- |
| [Shlink](https://github.com/shlinkio/shlink) | MIT | REST／CLI 完整、多網域、QR、點擊地理與裝置 | **建議採用** |
| [YOURLS](https://github.com/YOURLS/YOURLS) | MIT | 最老、外掛多；有 Mautic 外掛 | 若團隊只熟 PHP 可改用 |
| [Kutt](https://github.com/thedevs-network/kutt) | MIT | 隱私友善、UI 漂亮 | 候選 |
| [Dub](https://github.com/dubinc/dub) | AGPL-3.0 | 功能最像 Bitly／UTM 建構器 | 候選（較重） |
| Bitly / Rebrandly | 專有 | — | **不用** |

Mautic 本身會改寫信件內連結以追蹤開啟與點擊。Shlink 負責**對外品牌短網址**（社群、LINE、名片、QR、廣告）。兩者不要搶同一個連結，規則見架構文件。

---

## 6. 要讓四支柱「感覺像一個工具」的底座

| 層 | 專案 | 授權 | 決定 |
| --- | --- | --- | --- |
| 單一登入 | [Keycloak](https://www.keycloak.org/) | Apache-2.0 | **建議採用** |
| 單一登入（較輕） | [Authentik](https://github.com/goauthentik/authentik) | MIT | 候選 |
| 流程膠水 | [Activepieces](https://github.com/activepieces/activepieces) Community | MIT | **建議採用** |
| 流程膠水 | n8n | Sustainable Use License（非正式 OSI 開源） | **不用**（授權不符合「全部開源」） |
| 流程膠水 | [Huginn](https://github.com/huginn/huginn) | MIT | 過於工程導向，暫緩 |
| 信件投遞 | [Postal](https://github.com/postalserver/postal) | MIT | **建議採用**（自有 SMTP 時） |
| 信箱整包 | [Mailcow](https://github.com/mailcow/mailcow-dockerized) | GPL-3.0 | 若也要員工信箱再考慮 |
| 多通路客服 | [Chatwoot](https://github.com/chatwoot/chatwoot) | MIT + 企業版功能 | **第二期建議**（LINE／IG／FB） |
| 網站分析 | [Umami](https://github.com/umami-software/umami) | MIT | 候選 |
| 產品分析 | [PostHog](https://github.com/PostHog/posthog) | MIT + EE | 暫緩，避免第二個分析真相 |
| BI | [Metabase](https://github.com/metabase/metabase) | AGPL-3.0 | 第二期候選 |
| BI | [Frappe Insights](https://github.com/frappe/insights) | AGPL-3.0 | 與 ERPNext 同生態時優先於 Metabase |
| 反向代理 | Traefik 或 Caddy | MIT / Apache | 維運必備 |
| 資料庫 | PostgreSQL、MariaDB | OSI | 依上游要求 |
| 快取／佇列 | Redis | BSD | 依上游要求 |
| 物件儲存 | MinIO | AGPL-3.0 | 附件與落地頁素材 |

---

## 7. 台灣情境（不是第一期核心，但架構要留接口）

| 需求 | 開源／可行做法 | 時機 |
| --- | --- | --- |
| 繁體中文 | ERPNext、Mautic、Keycloak 皆有 i18n | 第一期就要開 |
| 統一編號、稅籍 | ERPNext 自訂欄位／地區模組 | 第一期主檔就要有欄位 |
| 電子發票、加值稅 | 社群地區模組或獨立閘道，**不要自寫稅核引擎** | 第二期 |
| LINE 官方帳號 | Chatwoot LINE channel；漏斗事件回寫 Mautic | 第二期（對台灣行銷幾乎必要） |
| 綠界／藍新／TapPay | 支付適配器（這些金流本身不是開源） | 有電商結帳時 |
| 個資法 | 同意紀錄、刪除權、存取日誌做在主檔與 Mautic | 第一期就要有事件與欄位，不要事後補 |

金流、簡訊、LINE 官方 API 屬於**外部網路服務**，無法用開源取代。開源的是適配器與資料所有權。

---

## 8. 明確不納入第一期的東西

- 自研 CRM／ERP 資料模型
- 自研信件驗證器或反垃圾引擎
- 自研短網址服務
- 自研拖放漏斗畫布（ClickFunnels clone）
- 第二套 CRM（Twenty + ERPNext 並行）
- n8n 當正式膠水（授權）
- 把 Odoo Enterprise 當「以後再買」的隱性依賴
- AI 客服、自動寫信、預測庫存（YAGNI；底座穩定再說）

---

## 9. 建議的最小開源組合（第一期）

```
Keycloak
    ├── ERPNext + Frappe          ← CRM + ERP 系統紀錄
    ├── Frappe Builder            ← 魅力圈落地頁外觀
    ├── Mautic                    ← 漏斗、計分、養成
    ├── Reacher                   ← 進線清庫
    ├── Shlink                    ← 品牌短網址與點擊
    ├── Postal                    ← 實際寄信
    └── Activepieces              ← 系統之間的同步與失敗重試
```

這九個專案覆蓋四支柱。官網用 Frappe Builder 算在 ERPNext 生態內，不另找建站系統。Chatwoot（LINE／IG／FB）、產業包、金流是加乘，不是骨架。

儀表板與公司流程：**不要另選一套 BPM 產品。** Frappe Workspace + Workflow 就是對標 Odoo Studio 的開源能力；跨系統（Mautic ↔ ERPNext）才走 Activepieces。
