import { expect, type Page } from "@playwright/test";

type Shot = (page: Page, name: string) => Promise<void>;

export type LocalFlowNotes = Record<string, string>;

/** Clicks that stay inside the practice shell. None of these may leave the machine. */
export async function exerciseRemainingLocalFlows(page: Page, posts: string[], shot: Shot): Promise<LocalFlowNotes> {
  const notes: LocalFlowNotes = {};
  notes.finance = await collectAndUpload(page, shot);
  notes.purchase = await payPurchase(page, shot);
  notes.hr = await approveLeave(page, shot);
  notes.meetings = await assertMeetingsStayClosed(page, shot);
  notes.status = await assertStatusIsDemo(page, shot);
  notes.reports = await customizeReports(page, shot);
  notes.chat = await replyInPractice(page, shot);
  notes.crm = await convertLeadLocally(page, shot);
  notes.website = await clickWebsitePractice(page, posts, shot);
  notes.team = await assertInviteDisabled(page, shot);
  notes.api = await assertKeyButtonDisabled(page, shot);
  notes.hygiene = await assertHygieneHasNoSend(page, shot);
  notes.booking = await submitLocalBooking(page, shot);
  notes.stock = await openRetailStock(page, posts, shot);
  return notes;
}

async function collectAndUpload(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/erp/finance");
  await page.getByRole("button", { name: "催收並入帳" }).first().click();
  await expect(page.getByText(/已收 .+。開單就入帳/)).toBeVisible();
  await shot(page, "25-finance-collect-local.png");
  await expect(page.getByRole("button", { name: "上傳加值中心" })).toHaveCount(0);
  await shot(page, "26-einvoice-upload-local.png");
  return "測試帳本沒有上傳加值中心";
}

async function payPurchase(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/erp/purchase");
  await expect(page.getByText("這一行沒有倉庫")).toBeVisible();
  await page.getByRole("button", { name: "付款", exact: true }).first().click();
  const note = page.getByText(/已付款。入庫與應付/);
  await expect(note).toBeVisible();
  await shot(page, "27-purchase-paid-local.png");
  return (await note.innerText()).trim();
}

async function approveLeave(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/hr");
  await expect(page.getByText("今天誰在承辦、誰請假")).toBeVisible();
  await page.getByRole("button", { name: "核准", exact: true }).first().click();
  const note = page.getByText(/沒有送出/);
  await expect(note).toBeVisible();
  await shot(page, "28-hr-approve-local.png");
  return (await note.innerText()).trim();
}

async function assertMeetingsStayClosed(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/meetings");
  await expect(page.getByText("開始前會自動進去（練習）").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "打開這場會" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /這場不進|關掉/ })).toHaveCount(0);
  await shot(page, "29-meetings-no-join.png");
  return "示範清單，沒有進會議的按鈕";
}

async function assertStatusIsDemo(page: Page, shot: Shot): Promise<string> {
  await page.goto("/status");
  await expect(page.getByText("目前顯示本機示範，沒有外部系統監控資料。")).toBeVisible();
  await shot(page, "30-status-demo.png");
  return "狀態頁標成示範資料";
}

async function customizeReports(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/reports");
  await expect(page.getByRole("heading", { name: "生意整體怎麼樣" })).toBeVisible();
  await page.getByRole("button", { name: "自訂儀表板" }).click();
  await expect(page.getByRole("button", { name: "完成" })).toBeVisible();
  await shot(page, "31-reports-customize.png");
  return "自訂儀表板只改這一頁的卡片";
}

async function replyInPractice(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/chat");
  await page.getByLabel("回她").fill("E2E只留在這台電腦");
  await page.getByRole("button", { name: "回她", exact: true }).click();
  const note = page.getByText(/已寫下給 .+還沒傳到/);
  await expect(note).toBeVisible();
  await shot(page, "32-chat-reply-local.png");
  return (await note.innerText()).trim();
}

async function convertLeadLocally(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/crm");
  const region = page.getByRole("region", { name: "現在這件" });
  const lead = (await region.getByRole("heading").innerText()).trim();
  for (let step = 0; step < 8; step += 1) {
    const button = region.getByRole("button");
    const label = (await button.innerText()).trim();
    await button.click();
    if (label.includes("轉成一筆生意")) {
      await page.waitForURL(/\/workspace\/erp\/sales/);
      await expect(page.getByText("測試帳本").first()).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: lead })).toHaveCount(0);
      await shot(page, "33-crm-to-quote.png");
      return `${lead} 的練習轉換沒有寫進測試帳本`;
    }
    await expect(page.getByText(`${lead} →`)).toBeVisible();
  }
  throw new Error("客人流程沒有走到轉成一筆生意");
}

async function clickWebsitePractice(page: Page, posts: string[], shot: Shot): Promise<string> {
  await page.goto("/workspace/website");
  const before = posts.length;
  await page.getByRole("button", { name: "留下資料（練習）" }).click();
  await expect(page).toHaveURL(/\/workspace\/website/);
  await expect(page.getByRole("button", { name: "留下資料（練習）" })).toBeVisible();
  expect(posts.length).toBe(before);
  await shot(page, "34-website-button.png");
  return "按鈕沒有送出";
}

async function assertInviteDisabled(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/team");
  await expect(page.getByText("這是範例團隊，按鈕先關著")).toBeVisible();
  await expect(page.getByRole("button", { name: "邀請", exact: true })).toBeDisabled();
  await shot(page, "35-team-invite-disabled.png");
  return "邀請按鈕是關的";
}

async function assertKeyButtonDisabled(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/settings/api");
  await expect(page.getByText("下面是範例金鑰和 Webhook，按鈕不會送出")).toBeVisible();
  await expect(page.getByRole("button", { name: "開一把金鑰" })).toBeDisabled();
  await shot(page, "36-api-keys-disabled.png");
  return "開金鑰按鈕是關的";
}

async function assertHygieneHasNoSend(page: Page, shot: Shot): Promise<string> {
  await page.goto("/workspace/hygiene");
  await expect(page.getByRole("cell", { name: "owner@example.com", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "info@example.com", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "temp@mailinator.com", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "打開" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /寄/ })).toHaveCount(0);
  await shot(page, "39-hygiene-demo.png");
  return "三筆示範信箱，沒有寄信按鈕";
}

async function submitLocalBooking(page: Page, shot: Shot): Promise<string> {
  await page.goto("/book");
  await expect(page.getByText("練習模式：名額記在這一家")).toBeVisible();
  await page.locator('input[name="courseCode"]').first().check();
  await page.locator('input[name="parentName"]').fill("E2E預約");
  await page.locator('input[name="phone"]').fill("0912000111");
  await page.locator("form").getByRole("button").click();
  const status = page.getByRole("status");
  await expect(status).toContainText("沒有送到店外的系統");
  await shot(page, "37-booking-local.png");
  return (await status.innerText()).replace(/\s+/g, " ").trim();
}

async function openRetailStock(page: Page, posts: string[], shot: Shot): Promise<string> {
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene: "retail",
        size: "small",
        industry: "apparel-store",
        modules: ["crm", "sales", "stock", "purchase", "finance"],
      }),
    });
    return res.status;
  });
  expect(status).toBe(200);
  await page.goto("/workspace/erp/stock");
  await expect(page.getByText("這家公司沒有倉庫要管")).toHaveCount(0);
  const before = posts.filter((line) => line.includes("/api/erp/purchase-request")).length;
  const button = page.getByRole("region", { name: "現在這件" }).getByRole("button");
  const label = (await button.innerText()).trim();
  await button.click();
  if (label === "請購") await expect(page.getByText(/已為「/)).toBeVisible();
  else if (label.includes("停賣")) await expect(page.getByText(/已停賣/)).toBeVisible();
  else if (label.includes("列缺")) await expect(page.getByText(/已列缺/)).toBeVisible();
  else throw new Error(`倉庫主按鈕不是預期的本機動作：${label}`);
  expect(posts.filter((line) => line.includes("/api/erp/purchase-request")).length).toBe(before);
  await shot(page, "38-stock-retail-local.png");
  return `服飾店示範倉庫，按了「${label}」，沒有送請購`;
}
