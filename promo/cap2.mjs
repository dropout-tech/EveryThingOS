import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const browser = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const base = "http://localhost:3456";
const shop = JSON.stringify({ scene: "edu", size: "mid", modules: ["crm", "sales", "stock", "finance", "chat", "hr"] });
const out = "/tmp/promo/v2";

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1.5 });
await page.setCookie(
  { name: "dropout_shop", value: shop, url: base },
  { name: "dropout_industry", value: "cram-school", url: base },
  { name: "dropout_theme", value: "white", url: base },
);

async function open(path) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{transition:none!important;animation:none!important}" });
  for (const b of await page.$$("button")) {
    const t = await b.evaluate((e) => e.textContent);
    if (t?.includes("知道了")) await b.click();
  }
  await new Promise((r) => setTimeout(r, 400));
}
async function shot(name, selector) {
  if (selector) {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    }, selector);
    await new Promise((r) => setTimeout(r, 300));
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, await page.evaluate(() => document.querySelectorAll(".btn-primary").length));
}

await open("/book?from=line");
await shot("book");
await page.type('input[name="parentName"]', "王媽媽");
await page.type('input[name="phone"]', "0912345678");
await page.click('button[type="submit"]');
await page.waitForSelector('[role="status"]');
await shot("book-done");

await open("/workspace/chat");
await shot("chat");
await page.evaluate(() => document.querySelector("details summary")?.click());
await shot("chat-links", "details");

await open("/workspace/erp/stock");
await shot("stock");
await page.evaluate(() => window.scrollTo(0, 620));
await shot("stock-2");
await page.evaluate(() => window.scrollTo(0, 1250));
await shot("stock-3");

await open("/workspace/hr");
await shot("hr");
await page.evaluate(() => window.scrollTo(0, 620));
await shot("hr-2");

await open("/workspace");
await shot("today");

await browser.close();
