import { synth } from "../synth.mjs";

const DUR = 43;
const s = synth(DUR);
const B = 0.5; // 120 BPM

// 0–3.2 hook: a clock and one pop per window that opens
for (let t = 0; t < 3.2; t += B) s.tick(t, 0.07);
s.pad(0, [45, 52, 57], 3.1, 0.03, 0.8, 0.3);
for (let i = 0; i < 8; i++) s.pop(0.7 + i * 0.22, 0.12, 420 + i * 60);
s.riser(2.2, 1.0, 0.1);

// 3.2–15.2 six pains, one bar each, minor groove with a stab on every pain
const MIN = [{ r: 33, c: [57, 60, 64] }, { r: 29, c: [57, 60, 65] }, { r: 31, c: [55, 59, 62] }, { r: 28, c: [56, 59, 64] }];
for (let bar = 0; bar < 6; bar++) {
  const t0 = 3.2 + bar * 2;
  const c = MIN[bar % 4];
  s.pad(t0, c.c, 2, 0.03, 0.05, 0.2);
  s.kick(t0, 0.9);
  s.add(t0, 0.3, (x) => Math.sign(Math.sin(2 * Math.PI * s.hz(c.c[0] + 12) * x)) * Math.exp(-x * 12), 0.05);
  for (let b = 0; b < 4; b++) {
    const tb = t0 + b * B;
    if (b) s.kick(tb, 0.65);
    s.hat(tb + B / 2, 0.12, b % 2 ? 0.4 : -0.4);
    if (b % 2) s.clap(tb, 0.2);
    s.bass(tb, c.r, 0.22, 0.26, 0.06);
    s.bass(tb + B / 2, c.r + 12, 0.2, 0.22, 0.08);
  }
  for (let k = 0; k < 6; k++) s.blip(t0 + 0.05 + k * 0.05, 300 + k * 30, 0.05, (k % 3) - 1);
}
s.riser(13.4, 1.8, 0.2);

// 15.2–17.6 reveal
s.whoosh(14.9, 1.1, 0.22);
s.boom(15.9, 0.85);
s.pad(15.9, [48, 55, 60, 64, 67], 1.6, 0.045, 0.05, 0.6);
[0, 0.12, 0.24, 0.36].forEach((d, i) => s.bell(15.95 + d, [72, 76, 79, 84][i], 0.06, i % 2 ? 0.3 : -0.3));

// 17.6–35.6 six answers on a bright groove, a whoosh at every change
const MAJ = [{ r: 36, c: [60, 64, 67] }, { r: 31, c: [59, 62, 67] }, { r: 33, c: [60, 64, 69] }, { r: 29, c: [60, 65, 69] }];
const END = 38.6;
for (let bar = 0; 17.6 + bar * 2 < END; bar++) {
  const t0 = 17.6 + bar * 2;
  const c = MAJ[bar % 4];
  s.pad(t0, c.c, Math.min(2, END - t0), 0.035, 0.05, 0.3);
  for (let b = 0; b < 4; b++) {
    const tb = t0 + b * B;
    if (tb >= END) break;
    s.kick(tb, 0.75);
    s.hat(tb + B / 2, 0.13, b % 2 ? 0.4 : -0.4);
    if (b % 2) s.clap(tb, 0.22);
    s.bass(tb + B / 2, c.r + 12, 0.22, 0.28, 0.1);
    s.bass(tb, c.r, 0.2, 0.22, 0.07);
  }
  for (let k = 0; k < 16; k++) {
    const ts = t0 + k * (B / 4);
    if (ts >= END) break;
    s.pluck(ts, [...c.c, c.c[1] + 12][k % 4] + 12, 0.06, k % 2 ? 0.3 : -0.3);
  }
}
for (let i = 1; i < 6; i++) { s.whoosh(17.6 + i * 3.5 - 0.35, 0.45, 0.12); s.blip(17.6 + i * 3.5 + 0.1, 1760, 0.05); }
s.blip(17.6 + 5 * 3.5 + 1.3, 1320, 0.07);
s.riser(37.2, 1.4, 0.12);

// 35.6–40 end card
s.boom(39, 0.7);
s.pad(39, [48, 55, 60, 64, 67], 2.4, 0.05, 0.05, 1.4);
[0, 0.25, 0.5, 0.75, 1.0].forEach((d, i) => s.pluck(39.6 + d, [72, 76, 79, 84, 88][i], 0.07, i % 2 ? 0.3 : -0.3, 6));
s.write("/tmp/promo/sales/music.wav", 1.4);
