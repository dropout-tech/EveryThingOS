export type DocRow = {
  no: string;
  party: string;
  item: string;
};

/** 用單號、客人、品名找單。空白或空字串回傳原來的全部。 */
export function findDocs<T extends DocRow>(query: string, rows: T[]): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.no.toLowerCase().includes(needle) ||
      row.party.toLowerCase().includes(needle) ||
      row.item.toLowerCase().includes(needle),
  );
}
