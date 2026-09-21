const PEOPLE = ["林安安", "陳冠宇", "王美玲", "黃志明", "張雅婷", "劉建宏", "吳佳蓉", "蔡承恩"];

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function practiceCast(packId: string): string[] {
  const seed = hash(packId);
  return PEOPLE.map((_, index) => PEOPLE[(seed + index * 5) % PEOPLE.length]);
}

export function practicePerson(packId: string, index = 0): string {
  const cast = practiceCast(packId);
  return cast[index] ?? PEOPLE[index % PEOPLE.length];
}
