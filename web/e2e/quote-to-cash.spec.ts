import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exerciseRemainingLocalFlows } from "./local-flows";

const shotDir = process.env.E2E_SHOT_DIR ?? path.join(process.cwd(), "e2e", "artifacts");
mkdirSync(shotDir, { recursive: true });

const PARTY = "E2E測報價客戶";
const PRACTICE_PARTY = "E2E練習客人";
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "fonts.gstatic.com", "fonts.googleapis.com"]);

const posts: string[] = [];
const offHost: string[] = [];

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(shotDir, name), fullPage: true });
}

function watch(page: Page) {
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!ALLOWED_HOSTS.has(url.hostname)) offHost.push(`${request.method()} ${url.origin}${url.pathname}`);
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      posts.push(`${request.method()} ${url.pathname}`);
    }
  });
}

test("本機從登入走到報價收款，帳寫進測試庫，不送出信件", async ({ page }) => {
  watch(page);

  await page.goto("/login");
  const opened = await page.evaluate(async () => {
    const res = await fetch("/api/erp/quotation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        party_type: "Customer",
        party: "E2E",
        items: [{ item_code: "E2E", qty: 1, rate: 1 }],
        grand_total: 99999,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; created?: { name?: string; grand_total?: number; invoice_status?: string } };
    return { status: res.status, ok: body.ok ?? false, message: body.message ?? "", name: body.created?.name ?? "", total: body.created?.grand_total ?? null, invoice: body.created?.invoice_status ?? "" };
  });
  const spoofed = await page.request.post("/api/erp/quotation", { headers: { origin: "http://evil.invalid", "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "http", "content-type": "application/json" }, data: {} });
  expect(spoofed.status()).toBe(403);
  expect(opened.status).toBe(401);
  expect(opened.ok).toBe(false);
  expect(opened.name).toBe("");

  await expect(page.getByRole("heading", { name: "用 Google 登入 EveryThingOS" })).toBeVisible();
  await page.getByRole("link", { name: "用 Google 登入" }).click();
  await expect(page.getByText("還沒設定 Google 登入。")).toBeVisible();
  await expect(page.getByText("不會改用密碼，也不會改用 ERPNext。")).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === "dropout_session" || cookie.name === "dropout_login")).toBe(false);
  await shot(page, "01-login-demo.png");
  const login = await page.request.post("/api/test-login");
  expect(login.status()).toBe(200);

  await page.goto("/?setup=1");
  await page.getByRole("button", { name: "接案／專業" }).click();
  await page.getByRole("button", { name: "顧問公司", exact: true }).click();
  await page.getByRole("button", { name: /2–10 人/ }).click();
  await expect(page.getByRole("button", { name: "做成一筆生意" })).toHaveAttribute("aria-pressed", "true");
  await shot(page, "02-onboard-features.png");
  await page.getByRole("button", { name: "開始今天" }).click();
  await expect(page).toHaveURL(/\/workspace\/?$/);
  await expect(page.getByText("現在這一家是顧問公司")).toBeVisible();
  await expect(page.getByText("練習", { exact: true })).toBeVisible();
  await shot(page, "03-today.png");

  await page.goto("/workspace/erp/sales");
  await expect(page.getByText("測試帳本").first()).toBeVisible();
  await page.getByLabel("誰在問").fill(PARTY);
  await page.getByLabel("未稅金額").fill("12000");
  await page.getByRole("button", { name: "開一張報價" }).click();
  const note = page.getByText(/已開 QT-\d+。含 5% 營業稅。/);
  await expect(note).toBeVisible();
  const quoteNo = ((await note.innerText()).match(/QT-\d{4}/) ?? [""])[0];
  expect(quoteNo).toMatch(/^QT-\d{4}$/);
  const card = page.locator("li").filter({ hasText: quoteNo });
  await expect(card).toContainText(PARTY);
  await expect(card).toContainText("NT$12,600");
  await expect(card).toContainText("尚未開統一發票");
  await shot(page, "04-sales-quote.png");

  await page.goto("/workspace/erp/finance");
  const openRow = page.getByRole("region", { name: "測試帳本" }).getByRole("row", { name: new RegExp(quoteNo) });
  await expect(openRow).toContainText(PARTY);
  await expect(openRow).toContainText("NT$12,600");
  await expect(openRow).toContainText("尚未開統一發票");
  await page.reload();
  await expect(page.getByRole("region", { name: "測試帳本" }).getByRole("row", { name: new RegExp(quoteNo) })).toContainText("NT$12,600");

  await page.goto("/workspace/erp/sales");
  const again = page.locator("li").filter({ hasText: quoteNo });
  for (const label of ["轉成訂單", "交付里程碑", "開立發票", "記入已收"]) {
    const button = again.getByRole("button", { name: label, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(again).toContainText(quoteNo);
  }
  await expect(again.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
  await expect(again).toContainText("尚未開統一發票");
  await shot(page, "05-sales-paid.png");

  await page.goto("/workspace/erp/finance");
  const paidRow = page.getByRole("region", { name: "測試帳本" }).getByRole("row", { name: new RegExp(quoteNo) });
  await expect(paidRow).toContainText("NT$12,600");
  await expect(paidRow).toContainText("NT$0");
  await expect(paidRow).toContainText("尚未開統一發票");
  await page.reload();
  await expect(page.getByRole("region", { name: "測試帳本" }).getByRole("row", { name: new RegExp(quoteNo) })).toContainText("NT$0");

  await page.context().clearCookies({ name: "dropout_session" });
  await page.goto("/workspace/practice");
  await expect(page.getByRole("heading", { name: "第一筆生意，先走一次" })).toBeVisible();
  await expect(page.getByText("不會動到任何真的資料")).toBeVisible();
  await page.getByLabel("客人").fill(PRACTICE_PARTY);
  await page.getByRole("button", { name: "開報價（練習）" }).click();
  await expect(page.getByText(`練習・${PRACTICE_PARTY}`, { exact: true })).toBeVisible();
  await shot(page, "06-practice-quote.png");
  for (const label of ["轉成訂單", "交付里程碑", "開立發票", "記入已收"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "一筆生意，從問到收錢" })).toBeVisible();
  await shot(page, "07-practice-done.png");

  await page.goto("/workspace/erp/finance");
  await expect(page.getByText("示範資料", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "測試帳本" }).getByRole("row", { name: new RegExp(quoteNo) })).toHaveCount(0);
  await expect(page.getByText(`練習・${PRACTICE_PARTY}`)).toHaveCount(0);
  await shot(page, "08-finance-not-linked.png");

  await page.goto("/workspace/letter");
  await expect(page.getByRole("heading", { name: "只寄給說好的人" })).toBeVisible();
  await expect(page.getByRole("button", { name: "寄出" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "看還沒確認的人" })).toBeVisible();
  await expect(page.getByText("示範資料", { exact: true }).first()).toBeVisible();
  await shot(page, "09-letter-not-sent.png");

  await page.goto("/workspace/chat");
  await expect(page.getByText("不會送到 Instagram")).toBeVisible();
  await shot(page, "10-chat-demo.png");

  await page.goto("/workspace/crm");
  await expect(page.getByRole("heading", { name: "一步一步跟到答應" })).toBeVisible();
  await expect(page.getByText("示範資料", { exact: true }).first()).toBeVisible();
  await shot(page, "11-crm-demo.png");

  await page.goto("/workspace/settings");
  await expect(page.getByText("示範資料，只在這台電腦走")).toBeVisible();
  await expect(page.getByText("測試帳本", { exact: true })).toBeVisible();
  await expect(page.getByText("對話（Chatwoot）")).toBeVisible();
  await expect(page.getByText("還沒接").first()).toBeVisible();
  await shot(page, "12-settings-not-connected.png");

  await page.goto("/workspace/meetings");
  await expect(page.getByText("示範資料", { exact: true }).first()).toBeVisible();
  await shot(page, "13-meetings-demo.png");

  await page.goto("/status");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, "14-status.png");

  const extraPages: [string, string, string][] = [
    ["/workspace/reports", "15-reports.png", "生意整體怎麼樣"],
    ["/workspace/hr", "16-hr.png", "今天誰在承辦、誰請假"],
    ["/workspace/website", "17-website.png", "留下資料（練習）"],
    ["/workspace/team", "18-team.png", "這是範例團隊，按鈕先關著"],
    ["/workspace/erp/purchase", "19-purchase.png", "這一行沒有倉庫"],
    ["/workspace/erp/stock", "20-stock.png", "這家公司沒有倉庫要管"],
    ["/workspace/hygiene", "21-hygiene.png", "假的信不要進客人"],
    ["/workspace/settings/api", "22-public-api.png", "下面是範例金鑰和 Webhook，按鈕不會送出"],
    ["/book", "23-booking.png", "練習模式：名額記在這一家"],
    ["/platform", "24-platform.png", "這個部署沒有開營運後台"],
  ];
  const pages: { path: string; shot: string; text: string }[] = [];
  for (const [href, file, ready] of extraPages) {
    await page.goto(href);
    await expect(page.getByText(ready).first()).toBeVisible();
    await expect(page.getByText("現在拿不到資料")).toHaveCount(0);
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500);
    pages.push({ path: href, shot: file, text });
    await shot(page, file);
  }

  const flows = await exerciseRemainingLocalFlows(page, posts, shot);
  const forbidden = posts.filter((line) => {
    if (/\/api\/(letter|crm|meetings|hr|platform|team|integrations)\b/.test(line)) return true;
    if (/\/api\/erp\/(?!quotation\b|advance\b)/.test(line)) return true;
    return false;
  });
  const bookingPosts = posts.filter((line) => line.startsWith("POST /api/booking"));
  const quotationPosts = posts.filter((line) => line.startsWith("POST /api/erp/quotation"));
  writeFileSync(
    path.join(shotDir, "e2e-result.json"),
    JSON.stringify({ party: PARTY, quotationOpened: opened, flows, posts, offHost, forbidden, bookingPosts, quotationPosts, pages }, null, 2),
  );
  expect(offHost, `離開本機的請求：${offHost.join(", ")}`).toEqual([]);
  expect(forbidden, `不該送出的寫入：${forbidden.join(", ")}`).toEqual([]);
  expect(bookingPosts).toEqual(["POST /api/booking"]);
  expect(quotationPosts).toEqual(["POST /api/erp/quotation", "POST /api/erp/quotation"]);
  expect(posts.some((line) => line.startsWith("POST /api/shop"))).toBe(true);
});
