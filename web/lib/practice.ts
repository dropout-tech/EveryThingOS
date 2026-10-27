const PEOPLE = [
  "林安安", "陳冠宇", "王美玲", "黃志明", "張雅婷", "劉建宏", "吳佳蓉", "蔡承恩",
  "周品妤", "許承翰", "鄭雅筑", "謝明哲", "羅心慈", "潘柏宇", "范宜庭", "馮子傑",
  "蘇佩玲", "鍾家豪", "葉庭瑜", "高敏惠", "丁冠霖", "姚思妤", "江柏宏", "方雅文",
];

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function practiceCast(packId: string): string[] {
  const seed = hash(packId || "shop");
  const start = seed % PEOPLE.length;
  const step = 3 + (seed % 5);
  const out: string[] = [];
  let hop = 0;
  while (out.length < 8 && hop < PEOPLE.length * 3) {
    const name = PEOPLE[(start + hop * step) % PEOPLE.length];
    if (!out.includes(name)) out.push(name);
    hop += 1;
  }
  return out;
}

export function practicePerson(packId: string, index = 0): string {
  const cast = practiceCast(packId);
  return cast[index] ?? PEOPLE[index % PEOPLE.length];
}
