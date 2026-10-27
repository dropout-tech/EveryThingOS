import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

// Real practice-mode pages in the default EveryThingOS look. Each step scrolls its card into view,
// screenshots the whole window and records the card's box so the video can push in on it.
const out = "/tmp/promo/v4";
fs.mkdirSync(out, { recursive: true });
const base = "http://localhost:3456";
const W = 1280, H = 760, DPR = 1.5, TOP = 72;
const shop = JSON.stringify({ scene: "edu", size: "mid", modules: ["crm", "sales", "stock", "finance", "chat", "hr"] });
const HIDE = "nextjs-portal { display: none !important; } * { transition: none !important; animation: none !important; }";
const CARD = "main .glass, main details, main form, main [role=status]";

const browser = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
await page.setCookie(
  { name: "dropout_theme", value: "white", url: base },
  { name: "dropout_shop", value: encodeURIComponent(shop), url: base },
  { name: "dropout_industry", value: "cram-school", url: base },
);

async function open(path, details = []) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: HIDE });
  await page.evaluate((details) => {
    for (const b of document.querySelectorAll("button")) if (b.textContent?.includes("知道了")) b.click();
    for (const d of document.querySelectorAll("main details")) {
      const s = d.querySelector("summary")?.textContent ?? "";
      d.open = details.some((k) => s.includes(k));
    }
  }, details);
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
}

async function shot(name, text, sel = CARD) {
  const rect = await page.evaluate(({ text, sel, TOP, H }) => {
    const area = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
    const el = [...document.querySelectorAll(sel)].filter((e) => e.textContent.includes(text)).sort((a, b) => area(a) - area(b))[0];
    if (!el) return null;
    const r0 = el.getBoundingClientRect();
    const room = H - TOP - 16;
    const want = r0.height < room ? r0.top + scrollY - TOP - (room - r0.height) / 2 : r0.top + scrollY - TOP;
    window.scrollTo(0, Math.max(0, want));
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(Math.min(r.height, H - r.top - 8)) };
  }, { text, sel, TOP, H });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${out}/${name}.png` });
  const primary = await page.evaluate(() => document.querySelectorAll(".btn-primary").length);
  console.log(name, JSON.stringify(rect), "btn-primary", primary);
  if (!rect) throw new Error(`${name}: no card with "${text}"`);
  return rect;
}

const meta = { W, H };
await open("/workspace/chat");
meta.chat = await shot("chat", "等最久");
await open("/workspace/erp/stock");
meta.stock = await shot("stock", "現在這件");
await open("/workspace/erp/stock", ["課程 BOM 與報名材料包"]);
meta.bom = await shot("bom", "課程 BOM 與報名材料包", "main details");
await open("/workspace/hr", ["師資技能標籤"]);
meta.teachers = await shot("teachers", "師資技能標籤與工時合規主檔", "main details");
await open("/workspace/hr");
meta.schedule = await shot("schedule", "AI 師資媒合與排班建議");
await open("/book?from=line");
meta.book = await shot("book", "課程", "form fieldset");
await page.type('input[name="parentName"]', "王媽媽");
await page.type('input[name="phone"]', "0912345678");
await page.click('button[type="submit"]');
await page.waitForSelector('[role="status"]');
await new Promise((r) => setTimeout(r, 400));
meta.booked = await shot("booked", "", "[role=status]");
fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 2));
await browser.close();
