// Six 3-second pain scenes. Each one escalates, then breaks on the beat at HIT with a stamp and a shake.
export const HIT = 2.0;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeIn = (x) => x ** 3;
const back = (x) => { const c = 1.8; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const lerp = (a, b, x) => a + (b - a) * x;

function el(parent, cls, html = "", style = {}) {
  const e = document.createElement("div");
  e.className = cls;
  e.innerHTML = html;
  Object.assign(e.style, style);
  parent.appendChild(e);
  return e;
}
// Elements are anchored at their centre.
function put(e, x, y, s = 1, r = 0, o = 1) {
  e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${r}deg) scale(${Math.max(s, 0)})`;
  e.style.opacity = clamp(o);
}
const pop = (L, at, d = 0.3) => back(span(L, at, at + d));
const shakeAt = (L, at, amp = 14) => (L > at ? Math.sin((L - at) * 70) * amp * Math.exp(-(L - at) * 7) : 0);

function stamp(root, text, x = 960, y = 420, r = -8) {
  const e = el(root, "stamp", text);
  return (L) => put(e, x, y, lerp(2.4, 1, back(span(L, HIT, HIT + 0.22))), r, span(L, HIT, HIT + 0.06));
}

function messages(root) {
  const cols = [["LINE", 23, 47, 640], ["IG", 8, 26, 960], ["FB", 5, 19, 1280]];
  const MSG = ["請問還有位子嗎？", "價格多少？", "可以改時間嗎？", "在嗎？", "週六幾點？", "6 歲可以上嗎？", "停車方便嗎？", "可以試上嗎？", "還在嗎？", "＋1"];
  const C = cols.map(([name, a, b, x], ci) => {
    const card = el(root, "vcard col", `<div class="colh"><b>${name}</b><span class="badge">0</span></div>`, { width: "290px", height: "430px" });
    const bubbles = Array.from({ length: 9 }, (_, k) => el(card, "msg", MSG[(k + ci * 3) % MSG.length]));
    return { card, x, a, b, ci, badge: card.querySelector(".badge"), bubbles };
  });
  const lost = el(root, "msg lost", `週六還有位嗎？<small>已等 3 小時，沒人回</small>`);
  const bye = el(root, "chip warn", "客人走了");
  const st = stamp(root, "−1 位客人", 960, 300, -7);
  return (L) => {
    C.forEach((c) => {
      put(c.card, c.x + shakeAt(L, HIT, 10), 430, pop(L, 0.05 + c.ci * 0.08), (c.ci - 1) * 2);
      const n = Math.floor(lerp(c.a, c.b, easeIn(span(L, 0.3, HIT))));
      c.badge.textContent = n;
      c.badge.style.transform = `scale(${1 + 0.25 * Math.abs(Math.sin(L * 18)) * span(L, 0.3, HIT)})`;
      const arrived = c.bubbles.map((_, k) => 0.3 + k * 0.17 + c.ci * 0.05);
      const count = arrived.filter((a) => L >= a).length;
      c.bubbles.forEach((b, k) => {
        const slot = count - 1 - k;
        const inK = easeOut(span(L, arrived[k], arrived[k] + 0.15));
        b.style.transform = `translate(${(1 - inK) * (k % 2 ? 40 : -40)}px, ${62 + slot * 46}px)`;
        b.style.opacity = inK * (slot < 8 ? 1 : 0);
      });
    });
    const fall = easeIn(span(L, HIT, HIT + 0.8));
    const grey = span(L, 1.1, 1.5);
    lost.classList.toggle("on", grey > 0.5);
    put(lost, 960 + fall * 120, 600 + fall * 260, pop(L, 0.9), fall * 35 + Math.sin(L * 9) * 2 * grey, span(L, 0.9, 1.0) * (1 - span(L, HIT + 0.5, HIT + 0.8)));
    put(bye, 1200 + easeOut(span(L, HIT, HIT + 0.6)) * 260, 640, pop(L, HIT + 0.1), 0, span(L, HIT + 0.1, HIT + 0.2) * (1 - span(L, 2.7, 2.9)));
    st(L);
  };
}

function excel(root) {
  const sheet = el(root, "vcard sheet", `<div class="cardh">庫存.xlsx<small>最後更新：上週</small></div>
    <table><tr><th>品項</th><th>庫存</th></tr><tr class="hot"><td>黏土包</td><td class="v">12</td></tr><tr><td>畫布</td><td>8</td></tr><tr><td>壓克力顏料</td><td>20</td></tr></table>`, { width: "400px" });
  const cell = sheet.querySelector(".hot");
  const shelf = el(root, "vcard shelf", `<div class="cardh">門市貨架・黏土包<small class="live">實際：12</small></div><div class="grid"></div>`, { width: "420px" });
  const live = shelf.querySelector(".live");
  const boxes = Array.from({ length: 12 }, () => el(shelf.querySelector(".grid"), "box", ""));
  const sold = Array.from({ length: 12 }, () => el(root, "minus", "賣出 −1"));
  const ask = el(root, "msg ask", "我要 2 包黏土");
  const st = stamp(root, "缺貨", 1230, 430, -10);
  return (L) => {
    put(sheet, 690 + shakeAt(L, HIT, 6), 420, pop(L, 0.05), -2);
    put(shelf, 1230 + shakeAt(L, HIT, 12), 430, pop(L, 0.15), 2);
    let left = 12;
    boxes.forEach((b, i) => {
      const at = 0.4 + i * 0.11;
      const k = span(L, at, at + 0.12);
      if (L >= at + 0.06) left--;
      b.style.transform = `scale(${1 - easeIn(k)})`;
      put(sold[i], 1088 + (i % 4) * 97, 382 + Math.floor(i / 4) * 76 - easeOut(span(L, at, at + 0.5)) * 70, 1, 0, span(L, at, at + 0.05) * (1 - span(L, at + 0.3, at + 0.5)));
    });
    live.textContent = `實際：${left}`;
    live.classList.toggle("zero", left === 0);
    cell.classList.toggle("on", L > HIT);
    cell.querySelector(".v").textContent = L > HIT ? "12 ？" : "12";
    put(ask, 1300, 680, pop(L, 1.65), 0, span(L, 1.65, 1.75));
    st(L);
  };
}

function seats(root) {
  const cls = el(root, "vcard seats", `<div class="cardh">黏土課・報名<small class="n">0 位</small></div><div class="grid"></div>`, { width: "460px" });
  const n = cls.querySelector(".n");
  const seat = Array.from({ length: 12 }, (_, i) => el(cls.querySelector(".grid"), "seat", `${i + 1}`));
  const packs = el(root, "vcard packs", `<div class="cardh">材料包<small>倉庫裡只有 8 包</small></div><div class="grid"></div>`, { width: "400px" });
  const pack = Array.from({ length: 12 }, (_, i) => el(packs.querySelector(".grid"), i < 8 ? "pk" : "pk empty", i < 8 ? "" : "?"));
  const st = stamp(root, "少 4 包", 1250, 440, -8);
  return (L) => {
    put(cls, 690 + shakeAt(L, HIT, 8), 430, pop(L, 0.05), -2);
    put(packs, 1250 + shakeAt(L, HIT, 12), 430, pop(L, 0.15), 2);
    let c = 0;
    seat.forEach((s, i) => {
      const at = 0.35 + i * 0.12;
      if (L >= at) c++;
      s.style.transform = `scale(${pop(L, at, 0.2)})`;
      const bad = i >= 8 && L >= at + 0.1;
      s.classList.toggle("bad", bad);
      pack[i].classList.toggle("used", i < 8 && L >= at + 0.1);
      pack[i].classList.toggle("alarm", i >= 8 && L >= at + 0.1);
      pack[i].style.transform = i >= 8 && L >= at + 0.1 ? `rotate(${Math.sin(L * 30 + i) * 6}deg)` : "";
    });
    n.textContent = `${c} 位`;
    st(L);
  };
}

function memory(root) {
  const T = [["王", "王老師"], ["李", "李老師"], ["陳", "陳老師"]];
  const cards = T.map(([a, name], i) => el(root, "vcard teacher", `<span class="av">${a}</span><b>${name}</b><div class="row">會教：<i>？</i></div><div class="row h">本週：<i>?? 小時</i></div>`, { width: "260px" }));
  const qs = Array.from({ length: 6 }, () => el(root, "q", "？"));
  const thoughts = ["誰會教美術？", "李老師排幾小時了？", "陳老師週六可以嗎？"].map((t) => el(root, "think", t));
  const notes = ["王：美術？", "李：週三請假？", "陳：只上午？"].map((t) => el(root, "note", t));
  const st = stamp(root, "全靠記憶", 960, 360, -6);
  return (L) => {
    cards.forEach((c, i) => {
      put(c, 640 + i * 320 + shakeAt(L, HIT, i === 1 ? 14 : 6), 520, pop(L, 0.05 + i * 0.08), (i - 1) * 3);
      if (i === 1) {
        c.classList.toggle("over", L > HIT);
        c.querySelector(".h i").textContent = L > HIT ? "已超過上限" : "?? 小時";
      }
    });
    qs.forEach((q, i) => put(q, 560 + i * 170, 330 + Math.sin(L * 5 + i) * 18, pop(L, 0.3 + i * 0.1), Math.sin(L * 4 + i) * 25, 0.85));
    thoughts.forEach((t, i) => put(t, [700, 1000, 1290][i], [215, 175, 220][i] + Math.sin(L * 3 + i) * 6, pop(L, 0.5 + i * 0.35), (i - 1) * 4, 1 - span(L, HIT, HIT + 0.3) * 0.6));
    notes.forEach((n, i) => {
      const f = easeIn(span(L, 1.3 + i * 0.22, 2.0 + i * 0.22));
      put(n, 640 + i * 320 + 70 + f * (i - 1) * 60, 430 + f * 420, pop(L, 0.2 + i * 0.1), 8 + f * (i % 2 ? 120 : -120), 1 - span(L, 2.4, 2.8));
    });
    st(L);
  };
}

function groupChat(root) {
  const file = el(root, "vcard file", `<div class="ficon">xlsx</div><b class="fn">排班表_v4</b><span class="tag">已修改</span>`);
  const fn = file.querySelector(".fn"), tag = file.querySelector(".tag");
  const NAMES = ["排班表_v4", "排班表_v5", "排班表_v6_最終", "排班表_v7_真的最終"];
  const VER = [0, 0.55, 1.05, 1.5];
  const phone = el(root, "vcard phone", `<div class="cardh">門市群組（12）<span class="badge">0</span></div><div class="feed"></div>`, { width: "360px", height: "470px" });
  const badge = phone.querySelector(".badge");
  const LINES = ["又改了？", "我週六不行", "那誰代？", "@店長", "我看錯班了", "可以換嗎", "收到", "＋1", "？？？", "到底哪一版", "我已經排別的事了", "誰有空"];
  const msgs = LINES.map((t, i) => el(phone.querySelector(".feed"), `gm ${i % 3 === 0 ? "me" : ""}`, t));
  const burst = el(root, "burst", "");
  const st = stamp(root, "群組炸了", 960, 330, -8);
  return (L) => {
    let v = 0;
    VER.forEach((a, i) => { if (L >= a) v = i; });
    fn.textContent = NAMES[v];
    const since = L - VER[v];
    put(file, 690 + (v ? Math.sin(since * 60) * 10 * Math.exp(-since * 8) : 0), 430, pop(L, 0.05), -2);
    tag.style.opacity = v ? 1 - span(since, 0.3, 0.45) : 0;
    const vib = span(L, 0.4, HIT) * 3 + (L > HIT ? 4 * Math.exp(-(L - HIT) * 4) : 0);
    put(phone, 1240 + Math.sin(L * 55) * vib * 2, 440, pop(L, 0.15), 2 + Math.sin(L * 47) * vib);
    const n = Math.floor(easeIn(span(L, 0.45, HIT)) * 99);
    badge.textContent = n >= 99 ? "99+" : n;
    badge.style.transform = `scale(${L > HIT ? 1 + 0.9 * Math.exp(-(L - HIT) * 5) : 1})`;
    const shown = msgs.filter((_, i) => L >= 0.5 + i * 0.13).length;
    msgs.forEach((m, i) => {
      const slot = shown - 1 - i;
      m.style.transform = `translateY(${-slot * 44}px)`;
      m.style.opacity = L >= 0.5 + i * 0.13 && slot < 9 ? 1 : 0;
    });
    put(burst, 1395, 245, lerp(0.3, 1.4, easeOut(span(L, HIT, HIT + 0.4))), 0, span(L, HIT, HIT + 0.05) * (1 - span(L, HIT + 0.3, HIT + 0.6)));
    st(L);
  };
}

function doubleBook(root) {
  const slot = el(root, "vcard slot", `<div class="cardh">週六 10:00・黏土課</div><div class="cap"><span class="dot"></span><b>剩 1 位</b></div>`, { width: "420px" });
  const cap = slot.querySelector(".cap b");
  const a = el(root, "vcard bk", `<span class="src">LINE</span>王媽媽・1 位<i>已確認 ✓</i>`, { width: "330px" });
  const b = el(root, "vcard bk", `<span class="src">電話</span>林爸爸・1 位<i>已確認 ✓</i>`, { width: "330px" });
  const qa = el(root, "chip", "庫存夠嗎？"), qb = el(root, "chip", "老師有空嗎？");
  const burst = el(root, "burst", "");
  const st = stamp(root, "重複劃位", 960, 300, -7);
  return (L) => {
    put(slot, 960 + shakeAt(L, HIT, 16), 300, pop(L, 0.05), 0);
    slot.classList.toggle("over", L > HIT);
    cap.textContent = L > HIT ? "2 / 1 位" : "剩 1 位";
    const m = easeIn(span(L, 0.35, HIT));
    const rebound = L > HIT ? Math.sin((L - HIT) * 20) * 26 * Math.exp(-(L - HIT) * 6) : 0;
    put(a, lerp(240, 790, m) - rebound, 540, pop(L, 0.2), lerp(-6, 4, m));
    put(b, lerp(1680, 1130, m) + rebound, 540, pop(L, 0.2), lerp(6, -4, m));
    a.classList.toggle("ok", L > HIT); b.classList.toggle("ok", L > HIT);
    put(qa, 560, 690 + Math.sin(L * 4) * 6, pop(L, 0.8), -4);
    put(qb, 1360, 690 + Math.cos(L * 4) * 6, pop(L, 1.1), 4);
    put(burst, 960, 540, lerp(0.3, 1.6, easeOut(span(L, HIT, HIT + 0.4))), 0, span(L, HIT, HIT + 0.05) * (1 - span(L, HIT + 0.3, HIT + 0.6)));
    st(L);
  };
}

export function buildPains(root) {
  return [messages, excel, seats, memory, groupChat, doubleBook].map((make) => {
    const scene = el(root, "scene", "");
    const update = make(scene);
    return { scene, update };
  });
}
