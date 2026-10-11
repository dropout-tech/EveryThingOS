# Vexa（會議紀錄機器人）

Vexa 用上游的 Docker Compose 安裝，不另寫一份：服務多、版本間會調整，照上游 README 最不容易壞。

```bash
git clone https://github.com/Vexa-ai/vexa && cd vexa
git checkout <固定一個 release tag>
# 依上游 README 設定 .env：ADMIN_API_TOKEN、轉錄方式（有 GPU 用本機 WhisperLive，沒有就用遠端轉錄）
# 讓 API gateway 加入 dropout 網路，Tunnel 才連得到：
docker network connect dropout <vexa 的 api-gateway 容器>
```

跟 DropOut 的接點只有三個，都是 Vexa 的公開 API：

| 誰 | 呼叫 | 用途 |
| --- | --- | --- |
| 導入工具 `provision --vexa-url --vexa-admin-token` | `POST /admin/users`、`POST /admin/users/{id}/tokens`、`PUT /user/webhook` | 每家公司一個 Vexa 使用者與 API key，會議結束通知膠水 |
| 膠水排程（每 5 分鐘） | `POST /bots` | 讀公司行事曆（ICS），十分鐘內開始的 Meet／Zoom／Teams 派機器人進去 |
| 膠水 `/vexa/:site/:token` | `GET /transcripts/{platform}/{id}` | 取逐字稿，Workers AI 寫摘要，記到 ERPNext 客人時間軸 |

`ADMIN_API_TOKEN` 只放在導入工具執行的地方；每家公司的 API key 由導入工具交給膠水加密保存。Vexa 的 admin API 要放在 Cloudflare Access 後面。
