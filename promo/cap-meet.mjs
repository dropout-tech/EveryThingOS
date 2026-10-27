import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

// Real practice-mode pages with the 米特製造所 look saved on the shop profile.
const out = "/tmp/promo/v3";
fs.mkdirSync(out, { recursive: true });
const base = "http://localhost:3456";
const W = 1100, H = 690, DPR = 2;
const shop = JSON.stringify({ scene: "edu", size: "mid", modules: ["crm", "sales", "stock", "finance", "chat", "hr"], brand: "meetplus", name: "米特才藝中心" });
// Nothing is restyled here: the shop profile picks the 米特製造所 look and store name, exactly as 設定 → 外觀與店名 saves it.
const HIDE = "nextjs-portal { display: none !important; } * { transition: none !important; animation: none !important; }";

const browser = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie(
  { name: "dropout_theme", value: "white", url: base },
  { name: "dropout_shop", value: encodeURIComponent(shop), url: base },
  { name: "dropout_industry", value: "cram-school", url: base },
);

async function prep(path, open) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: HIDE });
  await page.evaluate((open) => {
    for (const b of document.querySelectorAll("button")) if (b.textContent?.includes("知道了")) b.click();
    for (const d of document.querySelectorAll("main details")) {
      const s = d.querySelector("summary")?.textContent ?? "";
      d.open = open.some((k) => s.includes(k));
    }
  }, open);
  await document_fonts();
}
async function document_fonts() {
  await page.evaluate(async () => {
    await document.fonts.load('16px "jf open huninn"');
    await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 400));
}

async function capture(name, path, open, focus) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
  await prep(path, open);
  await page.screenshot({ path: `${out}/${name}-frame.png` });
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport({ width: W, height: full, deviceScaleFactor: DPR });
  await new Promise((r) => setTimeout(r, 400));
  const rects = await page.evaluate((focus) => {
    const out = {};
    for (const [key, { sel, text, up = 0 }] of Object.entries(focus)) {
      const area = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
      const el = [...document.querySelectorAll(sel)].filter((e) => e.textContent.includes(text)).sort((a, b) => area(a) - area(b))[0];
      if (!el) { out[key] = null; continue; }
      let box = el;
      for (let i = 0; i < up; i++) box = box.parentElement;
      const r = box.getBoundingClientRect();
      out[key] = { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  }, focus);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: `${out}/${name}-tall.png` });
  console.log(name, height, JSON.stringify(rects));
  return { height, rects };
}

const CARD = "main .glass, main details";
const focus = (map) => Object.fromEntries(Object.entries(map).map(([k, text]) => [k, { sel: CARD, text }]));
const meta = {};
meta.chat = await capture("chat", "/workspace/chat", ["預約連結"], focus({ a: "等最久", b: "預約連結" }));
meta.stock = await capture(
  "stock",
  "/workspace/erp/stock",
  ["課程 BOM 與報名材料包", "耗用／損耗登記", "退改課自動拆算"],
  focus({ a: "課程 BOM 與報名材料包", b: "耗用／損耗登記", c: "AI 備料與跨店調撥", r: "退改課自動拆算" }),
);
meta.hr = await capture(
  "hr",
  "/workspace/hr",
  ["主管覆核與異常留痕"],
  focus({ a: "AI 師資媒合與排班建議", b: "近期師資班表與請假代課檢查", c: "主管覆核與異常留痕紀錄" }),
);
fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 2));
await browser.close();
