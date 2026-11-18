# EveryThingOS 網頁

在 `web/` 執行 `npm install` 後，使用 `npx wrangler d1 migrations apply dropout-ledger-test --local` 套用本機帳本 migration，並執行 `npx wrangler d1 migrations apply everythingos-accounts --local` 套用帳號 migration，再執行 `npm run dev`。帳號資料使用獨立的本機帳號庫，不要與測試帳本混用。

`npm test` 執行單元測試；`npm run test:e2e` 執行 Playwright 本機旅程，自動套用本機 migration。E2E 限制使用 localhost 或 127.0.0.1。

客人、任務、文件和報價按登入公司的帳號隔離。報價、收款使用測試帳本，並非統一發票。尚未實作的畫面為本機示範。

首位老闆必須在 `OWNER_BOOTSTRAP_EMAILS` 明確綁定公司，例如 `owner@example.invalid:local`；多筆以逗號分隔。未設定時不允許建立首位老闆。
