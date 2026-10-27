import { synth } from "../synth.mjs";

// Warm, kid-friendly: ukulele strums, bells, claps. Tension (A minor, sparse) under each pain, bright C major under each answer.
const DUR = 45;
const s = synth(DUR);
const B = 60 / 108;
const MAJ = [
  { root: 36, ch: [60, 64, 67] }, // C
  { root: 31, ch: [59, 62, 67] }, // G
  { root: 33, ch: [60, 64, 69] }, // Am
  { root: 29, ch: [60, 65, 69] }, // F
];
const MIN = [
  { root: 33, ch: [57, 60, 64] }, // Am
  { root: 29, ch: [57, 60, 65] }, // F
  { root: 28, ch: [56, 59, 64] }, // E
  { root: 33, ch: [57, 60, 64] },
];

function strum(t, ch, g = 0.12, up = false) {
  const notes = up ? [...ch].reverse() : ch;
  notes.forEach((m, i) => s.string(t + i * 0.018, m, g, (i - 1) * 0.3, 0.8));
}

function bright(t0, t1, { drums = true, bells = true } = {}) {
  for (let t = t0, bar = 0; t < t1 - 0.01; t += 4 * B, bar++) {
    const c = MAJ[bar % 4];
    s.pad(t, c.ch, Math.min(4 * B, t1 - t), 0.022, 0.2, 0.4);
    for (let b = 0; b < 8; b++) {
      const tb = t + b * (B / 2);
      if (tb >= t1) break;
      if ([0, 3, 4, 6].includes(b)) strum(tb, c.ch, b === 0 ? 0.14 : 0.1, b % 2 === 1);
      if (drums) {
        if (b % 2 === 0) s.shaker(tb + B / 4, 0.05, b % 4 ? 0.4 : -0.4);
        if (b === 0 || b === 4) s.softKick(tb, 0.55);
        if (b === 2 || b === 6) s.clap(tb, 0.16);
      }
    }
    s.sub(t, c.root + 12, 2 * B - 0.05, 0.22);
    s.sub(t + 2 * B, c.root + 12, 2 * B - 0.05, 0.2);
    if (bells) [0, 1.5, 2, 3].forEach((d, i) => t + d * B < t1 && s.bell(t + d * B, [c.ch[2] + 12, c.ch[1] + 12, c.ch[0] + 24, c.ch[2] + 12][i], 0.05, i % 2 ? 0.3 : -0.3));
  }
}

function tense(t0, t1) {
  for (let t = t0, bar = 0; t < t1 - 0.01; t += 4 * B, bar++) {
    const c = MIN[bar % 4];
    s.pad(t, c.ch, Math.min(4 * B, t1 - t), 0.03, 0.6, 0.5);
    for (let b = 0; b < 4; b++) {
      const tb = t + b * B;
      if (tb >= t1) break;
      s.pluck(tb, c.ch[b % 3] + 12, 0.06, b % 2 ? 0.3 : -0.3, 9);
      s.tick(tb + B / 2, 0.05);
      if (b === 0) s.softKick(tb, 0.4);
    }
    s.sub(t, c.root + 12, 4 * B - 0.1, 0.18);
  }
}

// 0–4.5 title: gentle bells and strums
bright(0, 4.5, { drums: false });
s.bell(0.3, 84, 0.08);
s.bell(0.9, 88, 0.07);
// 4.5–12 pain 1
tense(4.5, 12.2);
[5.2, 5.45, 5.7, 5.95, 6.2].forEach((t) => s.pop(t, 0.12, 420));
[6.6, 6.75, 6.9, 7.05].forEach((t) => s.blip(t, 300, 0.1));
[8, 8.7, 9.4].forEach((t) => s.pop(t, 0.1, 300));
s.riser(10.6, 1.6, 0.1);
// 12.2 resolve: confetti
s.boom(12.4, 0.45);
[0, 1, 2, 3, 4].forEach((i) => s.bell(12.4 + i * 0.09, [72, 76, 79, 84, 88][i], 0.07, i % 2 ? 0.4 : -0.4));
bright(12.4, 23);
[14.4, 15.4, 16.4].forEach((t) => s.pop(t, 0.08, 700));
s.whoosh(18.4, 0.5, 0.1);
// 23–31 pain 2
tense(23, 31);
[23.6, 23.8, 24, 24.2, 24.4, 24.6].forEach((t) => s.pop(t, 0.1, 380));
[26.4, 27.1, 27.8].forEach((t) => s.pop(t, 0.1, 300));
s.riser(29.6, 1.6, 0.1);
// 31.2 resolve
s.boom(31.3, 0.45);
[0, 1, 2, 3, 4].forEach((i) => s.bell(31.3 + i * 0.09, [72, 76, 79, 84, 88][i], 0.07, i % 2 ? 0.4 : -0.4));
bright(31.3, 41);
[33, 34, 35].forEach((t) => s.pop(t, 0.08, 700));
// 41–45 close: ring out on C
s.pad(41, [48, 55, 60, 64, 67], 2.6, 0.04, 0.1, 1.4);
strum(41, [60, 64, 67, 72], 0.16);
[0, 0.3, 0.6, 0.9].forEach((d, i) => s.bell(41.6 + d, [76, 79, 84, 88][i], 0.06, i % 2 ? 0.3 : -0.3));
s.write("/tmp/promo/v1/music.wav", 1.6);
