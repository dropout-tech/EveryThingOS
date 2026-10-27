import * as THREE from "/node_modules/three/build/three.module.js";

const W = 1920, H = 1080;
const C = { bg: 0x0d1f3b, navy: 0x13305a, teal: 0x3ca59e, teal2: 0x65c5bc, orange: 0xe08a3c, cream: 0xf4efe4 };
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.setClearColor(C.bg);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(C.bg, 14, 42);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(5, 8, 10);
scene.add(key);
const rim = new THREE.PointLight(C.teal2, 60, 40);
rim.position.set(-8, -4, 6);
scene.add(rim);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeIn = (x) => x ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const back = (x) => { const c = 1.8; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const lerp = (a, b, x) => a + (b - a) * x;
const $ = (id) => document.getElementById(id);
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- 3D: the two rings and the loop from the 琢奧 mark, plus a field of dust ----------
const ringMat = (c, e = 0.25) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.35, metalness: 0.2 });
const orange = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.5, 48, 160), ringMat(C.orange));
const teal = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.28, 32, 120), ringMat(C.teal2));
scene.add(orange, teal);

const loopPts = [
  [1.6, 4.2], [0.9, 2.6], [-0.4, 0.6], [-1.9, -0.9], [-3.4, -1.6], [-4.2, -0.9], [-3.4, 0.0], [-1.8, -0.4], [-0.6, -1.6], [0.6, -2.3], [2.0, -2.0],
].map(([x, y]) => new THREE.Vector3(x, y, 0));
const loopCurve = new THREE.CatmullRomCurve3(loopPts);
const loopGeo = new THREE.TubeGeometry(loopCurve, 400, 0.32, 24, false);
const loopMat = new THREE.MeshStandardMaterial({ color: C.teal, emissive: C.teal, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.2 });
const loop = new THREE.Mesh(loopGeo, loopMat);
scene.add(loop);
const LOOP_IDX = loopGeo.index.count;

const sweepPts = [];
for (let i = 0; i <= 60; i++) {
  const u = i / 60;
  sweepPts.push(new THREE.Vector3(lerp(-16, 16, u), Math.sin(u * Math.PI * 2.2) * 2.2, Math.cos(u * Math.PI * 1.6) * 2));
}
const sweepGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sweepPts), 500, 0.16, 16, false);
const sweep = new THREE.Mesh(sweepGeo, new THREE.MeshBasicMaterial({ color: C.teal2, transparent: true }));
scene.add(sweep);
const SWEEP_IDX = sweepGeo.index.count;

const N = 900;
const dustPos = new Float32Array(N * 3), dustCol = new Float32Array(N * 3), dustBase = [];
const cT = new THREE.Color(C.teal2), cO = new THREE.Color(C.orange), cC = new THREE.Color(C.cream);
for (let i = 0; i < N; i++) {
  const b = { x: (rnd() * 2 - 1) * 24, y: (rnd() * 2 - 1) * 14, z: -26 + rnd() * 26, sp: 0.3 + rnd(), ph: rnd() * 6 };
  dustBase.push(b);
  const c = i % 9 === 0 ? cO : i % 4 === 0 ? cC : cT;
  dustCol.set([c.r, c.g, c.b], i * 3);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
dustGeo.setAttribute("color", new THREE.BufferAttribute(dustCol, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.8 }));
scene.add(dust);

// ---------- DOM ----------
const WINS = [
  ["LINE 官方帳號", "未讀 23", 80, 70],
  ["IG 私訊", "未讀 8", 470, 120],
  ["FB 粉專", "未回 5", 1120, 70],
  ["庫存.xlsx", "最後更新：上週", 1510, 130],
  ["材料清單.xlsx", "誰改的？", 60, 560],
  ["老師通訊錄", "專長寫在哪？", 1530, 560],
  ["排班表_v4_最終", "又改了", 330, 820],
  ["預約表單", "重複劃位 2 筆", 1270, 830],
];
const wins = WINS.map(([title, sub, x, y], i) => {
  const el = document.createElement("div");
  el.className = "win";
  el.innerHTML = `<div class="tb"><i></i><i></i><i></i></div><div class="bd">${title}<small>${sub}</small></div>`;
  $("wins").appendChild(el);
  return { el, x, y, r: [-4, 3, -2, 5, 3, -4, 2, -3][i] };
});

const PAINS = [
  { who: "每一家店", t: "LINE、IG、FB 各回各的，<b class='o'>漏回一則就少一個客人</b>", hl: [0, 1, 2] },
  { who: "零售／門市", t: "庫存記在 Excel，<b class='o'>賣完才知道沒貨</b>", hl: [3] },
  { who: "才藝／手作教室", t: "課都開了，<b class='o'>才發現材料包不夠</b>", hl: [4, 3] },
  { who: "補習班／教室", t: "哪位老師會教、排了幾小時，<b class='o'>全靠記憶</b>", hl: [5] },
  { who: "店長", t: "排班表改一次，<b class='o'>群組就炸一次</b>", hl: [6, 5] },
  { who: "老闆", t: "預約、庫存、老師兜不起來，<b class='o'>重複劃位</b>", hl: [7, 3, 5] },
];
const P0 = 3.2, PD = 2;

const ANS = [
  { x: "LINE、IG、FB 各回各的", t: "LINE、IG、FB、官網<br><b class='t'>同一個收件匣</b>", s: "誰等最久排最前面，回覆記在客人的時間軸。<br>需連結店家自己的 LINE 官方帳號與粉專。", A: ["chat.png", [205, 95, 770, 513]], url: "/workspace/chat" },
  { x: "庫存記在 Excel，賣完才知道", t: "低於安全量<br><b class='t'>自動標「不夠」</b>", s: "點「請購」直接進貨，不用再記兩張單。", A: ["stock.png", [205, 95, 560, 320]], url: "/workspace/erp/stock" },
  { x: "課開了才發現材料不夠", t: "課程 BOM<br><b class='t'>報名就鎖材料包</b>", s: "每堂課用哪些材料、還能收幾位、<br>卡在哪一項，一眼看到。", A: ["stock-3.png", [212, 200, 762, 250]], url: "/workspace/erp/stock" },
  { x: "老師資料全靠記憶", t: "請假、工時、專長<br><b class='t'>一頁看完</b>", s: "專長、適教年齡、支援分店都在師資檔案；<br>假單一鍵核准。", A: ["hr-2.png", [205, 55, 780, 215]], url: "/workspace/hr" },
  { x: "排班表改一次炸一次", t: "AI 排班建議<br><b class='t'>主管一鍵確認</b>", s: "自動避開請假與超時的老師；<br>換人也會留下紀錄。", A: ["hr-2.png", [212, 305, 768, 190]], url: "/workspace/hr" },
  { x: "預約跟庫存兜不起來", t: "LINE、IG 都能預約<br><b class='t'>有料才收單</b>", s: "材料夠就開單鎖料；不夠自動候補，<br>並標出缺哪一項。", A: ["book.png", [255, 40, 515, 350]], B: ["book-done.png", [255, 190, 515, 170]], url: "/book?from=line" },
];
const A0 = 17.6, AD = 3.5, E = A0 + 6 * AD, DUR = E + 4.4;
const K = 1920 / 1024;
const imgs = {};
function place(img, view, shot, [file, [x, y, w, h]], width, top) {
  img.src = `/promo/v2/${file}`;
  const s = width / (w * K);
  img.style.width = `${1920 * s}px`;
  img.style.transform = `translate(${-x * K * s}px, ${-y * K * s}px)`;
  view.style.height = `${h * K * s}px`;
  shot.style.width = `${width}px`;
  shot.style.top = `${top ?? 540 - (h * K * s + 40) / 2}px`;
}
const dots = [...document.querySelectorAll("#dots span")];

window.ready = (async () => {
  await document.fonts.load('700 60px "Noto Sans CJK TC"');
  await document.fonts.load('900 60px "Noto Sans CJK TC"');
  const files = new Set(ANS.flatMap((a) => [a.A[0], a.B?.[0]]).filter(Boolean));
  await Promise.all([...files].map((f) => new Promise((r) => { const i = new Image(); i.onload = r; i.src = `/promo/v2/${f}`; imgs[f] = i; })));
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = r)))));
  await document.fonts.ready;
  return true;
})();

let lastAns = -1;
window.renderAt = (t) => {
  // ---- 3D ----
  const tension = Math.max(span(t, 3, 3.6) * (1 - span(t, 14.8, 15.3)), 0);
  const rv = span(t, 15.2, 17.2);
  const endK = easeInOut(span(t, E, E + 1.6));
  for (let i = 0; i < N; i++) {
    const b = dustBase[i];
    const z = ((b.z + t * b.sp * (1.2 + rv * 6) + 26) % 26) - 26;
    dustPos[i * 3] = b.x + Math.sin(t * 0.3 + b.ph) * 0.4 + tension * Math.sin(t * 17 + b.ph) * 0.05;
    dustPos[i * 3 + 1] = b.y + Math.cos(t * 0.25 + b.ph) * 0.4;
    dustPos[i * 3 + 2] = z;
  }
  dustGeo.attributes.position.needsUpdate = true;

  // rings drift behind the hook and pains, face the camera at the reveal, and frame the end card
  const shake = tension * Math.sin(t * 23) * 0.06;
  const ansK = easeInOut(span(t, 17.2, 18.2)) * (1 - endK);
  const face = easeInOut(Math.max(rv * (1 - span(t, 17.2, 18.2)), endK));
  const rvE = easeInOut(rv);
  const ox = lerp(lerp(lerp(6.5, 10, rvE), 9.5, ansK), 11.8, endK);
  const oy = lerp(lerp(lerp(2.4, -0.6, rvE), -4.2, ansK), -3.6, endK);
  const oz = lerp(lerp(lerp(-10, -6, rvE), -9, ansK), -8, endK);
  orange.position.set(ox + shake, oy, oz);
  orange.rotation.set(lerp(1.1 + t * 0.12, 0.25 + Math.sin(t * 0.4) * 0.15, face), lerp(0.6 + t * 0.2, -0.35 + Math.sin(t * 0.3) * 0.2, face), t * 0.05);
  teal.position.set(lerp(lerp(lerp(-7.5, -6.4, rvE), -13.5, ansK), -9, endK) - shake, lerp(lerp(lerp(-2.8, 2.6, rvE), 6.8, ansK), 3.4, endK), lerp(-8, -5, rvE));
  teal.rotation.set(0.8 + t * 0.3, t * 0.4, 0);
  const mats = [orange.material, teal.material];
  mats.forEach((m) => (m.emissiveIntensity = 0.2 + 0.5 * Math.exp(-((t - 16) ** 2) * 2) + tension * 0.05 * Math.sin(t * 9)));

  loop.visible = false;
  const sw = span(t, 14.9, 16.2);
  sweep.visible = sw > 0 && t < 17.4;
  sweepGeo.setDrawRange(0, Math.floor((SWEEP_IDX * easeInOut(sw)) / 6) * 6);
  sweep.material.opacity = 1 - span(t, 16.6, 17.4);

  camera.position.set(Math.sin(t * 0.21) * 0.6, Math.cos(t * 0.17) * 0.35, 16 + Math.sin(t * 0.1) * 0.4 - rv * (1 - span(t, 17, 18)) * 1.5);
  camera.lookAt(0, 0, -4);
  renderer.render(scene, camera);

  // ---- hook 0–3.2 ----
  const hk = easeOut(span(t, 0.1, 0.7)) * (1 - span(t, 3.0, 3.3));
  $("hook").style.opacity = hk;
  $("hookT").style.transform = `translateY(${(1 - easeOut(span(t, 0.1, 0.7))) * 40}px)`;
  const opened = Math.min(8, Math.floor(span(t, 0.7, 2.5) * 8.999));
  $("count").textContent = opened;
  $("count").style.transform = `scale(${1 + 0.18 * Math.exp(-(((t - 0.7) * 4.5) % 1) * 6) * (t > 0.7 && t < 2.6 ? 1 : 0)})`;

  // ---- windows: open during the hook, shake under their pain, get pulled into one at the reveal ----
  const pi = t >= P0 && t < P0 + PAINS.length * PD ? Math.floor((t - P0) / PD) : -1;
  const pull = easeIn(span(t, 15.0, 15.9));
  wins.forEach((w, i) => {
    const open = back(span(t, 0.7 + i * 0.22, 1.1 + i * 0.22));
    const lit = pi >= 0 && PAINS[pi].hl.includes(i);
    const first = pi >= 0 && PAINS[pi].hl[0] === i;
    const litK = pi >= 0 ? easeOut(span(t - (P0 + pi * PD), 0, 0.3)) : 0;
    const dim = pi >= 0 && !lit ? 0.14 : 1;
    let x = w.x, y = w.y, sc = open;
    if (lit && first) { x = lerp(w.x, 795, litK); y = lerp(w.y, 300, litK); sc *= lerp(1, 1.55, litK); }
    else if (lit) sc *= lerp(1, 1.15, litK);
    const jig = lit ? Math.sin(t * 38 + i) * 4 : 0;
    x = lerp(x, 795, pull); y = lerp(y, 420, pull); sc *= 1 - pull;
    w.el.style.opacity = span(t, 0.7 + i * 0.22, 0.9 + i * 0.22) * dim * (1 - span(t, 15.6, 15.9));
    w.el.style.transform = `translate(${x + jig}px, ${y}px) rotate(${w.r * (1 - pull) + (lit ? Math.sin(t * 30) * 1.5 : 0)}deg) scale(${sc})`;
    w.el.style.borderColor = lit ? "#e08a3c" : "rgba(101,197,188,0.28)";
  });

  // ---- pains 3.2–15.2 ----
  $("pain").style.opacity = span(t, P0, P0 + 0.2) * (1 - span(t, 15, 15.2));
  $("pnum").style.opacity = $("pain").style.opacity;
  if (pi >= 0) {
    const p = PAINS[pi];
    const local = t - (P0 + pi * PD);
    $("who").textContent = p.who;
    $("painT").innerHTML = p.t;
    $("pnum").textContent = `痛點 ${pi + 1} / 6`;
    const k = easeOut(span(local, 0, 0.3));
    $("painT").style.transform = `translateY(${(1 - k) * 36}px)`;
    $("painT").style.opacity = k * (1 - span(local, 1.85, 2));
  }

  // ---- reveal 15.2–17.6 ----
  const rvk = easeOut(span(t, 15.9, 16.5));
  $("reveal").style.opacity = rvk * (1 - span(t, 17.3, 17.7));
  $("reveal").querySelector("h1").style.transform = `scale(${0.85 + 0.15 * back(span(t, 15.9, 16.6))})`;

  // ---- answers A0–E ----
  const ai = t >= A0 && t < A0 + ANS.length * AD ? Math.floor((t - A0) / AD) : -1;
  $("ans").style.opacity = span(t, A0, A0 + 0.25) * (1 - span(t, E - 0.3, E));
  if (ai >= 0) {
    const a = ANS[ai];
    const local = t - (A0 + ai * AD);
    if (ai !== lastAns) {
      $("aNum").textContent = `對應痛點 ${ai + 1}`;
      $("aX").textContent = a.x;
      $("aT").innerHTML = a.t;
      $("aS").innerHTML = a.s;
      $("aUrl").textContent = `dropout.tw${a.url}`;
      place($("imgA"), $("shotA").querySelector(".view"), $("shotA"), a.A, 1000, a.B ? 120 : undefined);
      if (a.B) {
        place($("imgB"), $("shotB").querySelector(".view"), $("shotB"), a.B, 760, 560);
        $("bUrl").textContent = "預約完成";
      }
      lastAns = ai;
    }
    const inK = easeOut(span(local, 0, 0.45)), outK = span(local, AD - 0.2, AD);
    $("aX").style.opacity = easeOut(span(local, 0.05, 0.35)) * (1 - outK);
    $("aT").style.opacity = inK * (1 - outK);
    $("aT").style.transform = `translateY(${(1 - inK) * 34}px)`;
    $("aS").style.opacity = easeOut(span(local, 0.4, 0.8)) * (1 - outK);
    $("aNum").style.opacity = inK * (1 - outK);
    const sk = easeOut(span(local, 0.1, 0.6));
    $("shotA").style.opacity = sk * (1 - outK);
    $("shotA").style.transform = `translateX(${(1 - sk) * 160}px) perspective(1600px) rotateY(${(1 - sk) * -14 - 3}deg) translateY(${Math.sin(t * 1.2) * 6}px)`;
    const bk = a.B ? easeOut(span(local, 1.3, 1.8)) : 0;
    $("shotB").style.opacity = bk * (1 - outK);
    $("shotB").style.left = "1100px";
    $("shotB").style.transform = `translateY(${(1 - bk) * 80}px) scale(${0.9 + 0.1 * bk})`;
    dots.forEach((d, i) => (d.style.background = i === ai ? "#e08a3c" : i < ai ? "rgba(101,197,188,0.75)" : "rgba(244,239,228,0.2)"));
  }

  // ---- end E–DUR ----
  const ek = easeOut(span(t, E + 0.4, E + 1.2));
  $("end").style.opacity = ek * (1 - span(t, DUR - 0.6, DUR));
  $("end").querySelector("h2").style.transform = `translateY(${(1 - ek) * 30}px)`;
  const lk = easeOut(span(t, E + 1.0, E + 1.8));
  $("end").querySelector("img").style.opacity = lk;
  $("end").querySelector("img").style.transform = `scale(${0.9 + 0.1 * lk})`;
  $("end").querySelector(".url").style.opacity = easeOut(span(t, E + 1.7, E + 2.4));
};
