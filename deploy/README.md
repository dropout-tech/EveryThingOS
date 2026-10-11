# 部署

Cloudflare 跑殼與膠水；一台主機跑有狀態的系統（ERPNext、Chatwoot、Vexa），主機不開對外埠，靠 Cloudflare Tunnel 相連。主機壞掉時，webhook 仍在 Cloudflare 的佇列裡排隊，恢復後依冪等鍵補送；殼顯示「現在拿不到資料」，不退回示範資料。

```
deploy/
  erpnext/     Containerfile（ERPNext v15 + Payments + Webshop + DropOut apps）、apps.json、compose.yml
  chatwoot/    compose.yml、.env.example
  vexa/        用上游 Compose；這裡只寫接點
  cloudflared/ compose.yml（Tunnel）
```

這些設定檔照上游（frappe_docker 的 `pwd.yml` 與 layered Containerfile、Chatwoot 的 production compose）整理，還沒在真的主機上跑過；第一次上線時照下面順序做，並把遇到的差異改回這裡。

## 主機（Coolify）

1. 裝 Coolify，Coolify 介面本身放在 Cloudflare Access 後面。
2. 建 Docker 網路：`docker network create dropout`。
3. 每個資料夾在 Coolify 建一個「Docker Compose」資源，指向這個 repo 的對應 `compose.yml`，祕密填在 Coolify 的環境變數：
   - `deploy/erpnext`：`ERPNEXT_IMAGE`、`DB_ROOT_PASSWORD`
   - `deploy/chatwoot`：`CHATWOOT_IMAGE`（固定版本）與 `.env.example` 裡的值
   - `deploy/cloudflared`：`TUNNEL_TOKEN`
4. ERPNext 映像：在 CI 或主機上從 repo 根目錄 build。

   ```bash
   docker build -f deploy/erpnext/Containerfile -t ghcr.io/dropout-tech/erpnext:15 .
   ```

5. Chatwoot 第一次：`docker compose run --rm rails bundle exec rails db:chatwoot_prepare`，再建 Super Admin 與 Platform App，拿到 Platform token。
6. Vexa：見 `deploy/vexa/README.md`。

## Cloudflare

```bash
cd glue
npx wrangler d1 create dropout-glue           # 把 id 填進 wrangler.jsonc
npx wrangler queues create dropout-jobs
npx wrangler queues create dropout-jobs-dlq
npx wrangler d1 migrations apply dropout-glue --remote
npx wrangler secret put TENANT_KEY            # openssl rand -base64 32
npx wrangler secret put ADMIN_TOKEN
npm run deploy

cd ../web
npm run deploy
# 每家公司的殼：導入工具 provision 最後印出的變數，用 wrangler secret put 設定
```

需要 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`（放在 Cursor Cloud Agents Secrets 或 CI 的祕密，不進 git）。寄信用 Cloudflare Email Service 前，要先在 Cloudflare 驗證寄件網域。

## 開一家新公司

在主機的 ERPNext 容器裡跑導入工具（它呼叫 `bench`）：

```bash
docker compose -f deploy/erpnext/compose.yml exec backend bash
pip install /path/to/toolkit
dropout-onboard provision dropout-profile.json --site acme.erp.dropout.tw --company 安安顧問 \
  --admin-email boss@acme.tw --bench-dir /home/frappe/frappe-bench \
  --erpnext-url https://acme.erp.dropout.tw --shell-url https://acme.os.dropout.tw \
  --glue-url https://glue.dropout.tw --glue-admin-token "$GLUE_ADMIN_TOKEN" \
  --chatwoot-url https://chat.dropout.tw --chatwoot-platform-token "$CHATWOOT_PLATFORM_TOKEN" \
  --vexa-url https://meet-api.dropout.tw --vexa-admin-token "$VEXA_ADMIN_TOKEN"
```

先不加 `--apply` 看一遍，再加上執行。細節見 `toolkit/README.md`。

## 備份

- ERPNext：開站時加 `--backup-bucket`、`--backup-endpoint`，每個 site 用內建 S3 備份每天送到 R2 的 `<site>/<時間>/`。膠水每天檢查，超過 26 小時沒有新的一份就通知。
- Chatwoot、Vexa 的 Postgres：Coolify 的排程備份送到 R2。
- 膠水的 D1：Time Travel 30 天，加上每天 `glue/scripts/d1-backup.sh export`（GitHub Actions `d1-backup.yml`）。
- R2 bucket 加兩條 lifecycle 規則：`purged/` 30 天、`d1/` 90 天（指令見 [docs/RELIABILITY.md](../docs/RELIABILITY.md)「備份與還原」）。
- 每月從 R2 還原一次到暫存站，確認備份能用：`dropout-onboard backup verify <site> --from-r2 --with-files --apply`。

R2 金鑰只用環境變數給：`BACKUP_ACCESS_KEY_ID`、`BACKUP_SECRET_ACCESS_KEY`、`BACKUP_BUCKET`、`BACKUP_ENDPOINT`。toolkit 用 bench 自己的 `env/bin/python`（ERPNext 已經裝了 boto3）讀寫 bucket，不用另外裝東西。

## 整台主機壞掉

1. 新主機照上面裝到「ERPNext」那一步（同一個 `TUNNEL_TOKEN`；cloudflared 先不要起來，免得客戶連到還沒還原好的站）。
2. 在 backend 容器裡裝 toolkit，設好 R2 與膠水的環境變數：

```bash
docker compose -f deploy/erpnext/compose.yml exec backend bash
pip install /path/to/toolkit
export BACKUP_ACCESS_KEY_ID=… BACKUP_SECRET_ACCESS_KEY=… BACKUP_BUCKET=… BACKUP_ENDPOINT=… GLUE_URL=https://glue.dropout.tw GLUE_ADMIN_TOKEN=… DB_ROOT_PASSWORD=…
dropout-onboard fleet restore-all --from-r2                                                  # 預演
dropout-onboard fleet restore-all --from-r2 --mariadb-user-host-login-scope='%' --apply
```

3. 全部完成後啟動 `deploy/cloudflared`，看 `/status` 回到正常，營運後台重送死信。

一家一家做，先付費的；進度與預估剩下時間寫在 `~/.dropout-onboard/restore-all/`。中斷了再跑一次，做好的會略過。完整流程與時間表見 [docs/RELIABILITY.md](../docs/RELIABILITY.md)「整台主機壞掉」。

## 升級

- ERPNext：改 `apps.json` 的分支或 Containerfile 的 `FRAPPE_BRANCH`，重 build，部署後對每個 site 跑 `bench --site <site> migrate`。DropOut apps 的設定會在 migrate 時自動補齊。
- Chatwoot：換 `CHATWOOT_IMAGE` 的版本，跑 `rails db:chatwoot_prepare`。
- 膠水與殼：`npm run deploy`。
