/**
 * Reads the first sheet of an .xlsx file into rows of text, in the browser,
 * without a library: an .xlsx is a zip of XML files, browsers inflate zip
 * entries with `DecompressionStream("deflate-raw")`, and the few XML shapes a
 * sheet uses are regular enough for plain string matching. Formulas come out as
 * their last saved value; dates come out as Excel serial numbers (no import
 * kind here has a date column).
 *
 * No imports on purpose: `scripts/importer.test.mjs` runs it directly in Node.
 */

export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

export class XlsxError extends Error {}

type Entry = { name: string; method: number; compressed: number; size: number; offset: number };

function entries(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new XlsxError("這不是 Excel（.xlsx）檔");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = new Map<string, Entry>();
  const names = new TextDecoder("utf-8");
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new XlsxError("Excel 檔壞掉了，請另存一次再試");
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = names.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    out.set(name, { name, method, compressed, size, offset });
    p += 46 + nameLength + extra + comment;
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function read(bytes: Uint8Array, all: Map<string, Entry>, name: string): Promise<string | null> {
  const e = all.get(name);
  if (!e) return null;
  if (e.size > MAX_ENTRY_BYTES) throw new XlsxError("這個 Excel 太大了，請只留要匯入的那一頁，或另存成 CSV");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(e.offset, true) !== 0x04034b50) throw new XlsxError("Excel 檔壞掉了，請另存一次再試");
  const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  const raw = bytes.subarray(start, start + e.compressed);
  if (e.method === 0) return new TextDecoder("utf-8").decode(raw);
  if (e.method !== 8) throw new XlsxError("看不懂這個 Excel 的壓縮方式，請另存成 CSV");
  if (typeof DecompressionStream === "undefined") throw new XlsxError("這個瀏覽器讀不了 Excel，請另存成 CSV 或直接複製貼上");
  return new TextDecoder("utf-8").decode(await inflate(raw));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescape(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? _;
  });
}

/** Text of every <t> inside, skipping phonetic runs (<rPh>), which hold furigana/bopomofo. */
function textOf(xml: string) {
  return unescape(
    xml
      .replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")
      .match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g)
      ?.map((t) => t.replace(/^<t\b[^>]*>|<\/t>$|^<t\b[^>]*\/>$/g, ""))
      .join("") ?? "",
  );
}

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unescape(m[1]) : null;
}

function columnIndex(ref: string | null, fallback: number) {
  const letters = ref?.match(/^[A-Z]+/)?.[0];
  if (!letters) return fallback;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function numberText(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(15)));
}

async function firstSheetPath(bytes: Uint8Array, all: Map<string, Entry>) {
  const workbook = await read(bytes, all, "xl/workbook.xml");
  const rels = await read(bytes, all, "xl/_rels/workbook.xml.rels");
  const sheet = workbook?.match(/<sheet\b[^>]*>/)?.[0];
  const id = sheet ? (attr(sheet, "r:id") ?? attr(sheet, "id")) : null;
  const rel = id && rels ? rels.match(/<Relationship\b[^>]*>/g)?.find((r) => attr(r, "Id") === id) : null;
  const target = rel ? attr(rel, "Target") : null;
  if (target) {
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    if (all.has(path)) return path;
  }
  return all.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : [...all.keys()].find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)) ?? null;
}

export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  if (bytes.length > MAX_XLSX_BYTES) throw new XlsxError("檔案超過 10 MB，請只留要匯入的那一頁，或另存成 CSV");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxError("這不是 Excel（.xlsx）檔；舊的 .xls 請先另存成 .xlsx 或 CSV");
  const all = entries(bytes);
  const path = await firstSheetPath(bytes, all);
  if (!path) throw new XlsxError("Excel 裡找不到工作表");
  const sharedXml = await read(bytes, all, "xl/sharedStrings.xml");
  const shared = sharedXml ? (sharedXml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? []).map(textOf) : [];
  const sheet = (await read(bytes, all, path)) ?? "";

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${cellMatch[1]}>`;
      const body = cellMatch[2] ?? "";
      const index = columnIndex(attr(tag, "r"), next);
      next = index + 1;
      if (index > 200) continue;
      const type = attr(tag, "t");
      const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let text = "";
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = textOf(body);
      else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
      else if (type === "e") text = "";
      else if (type === "str") text = v ? unescape(v) : "";
      else text = v ? numberText(unescape(v)) : "";
      while (cells.length < index) cells.push("");
      cells[index] = text.trim();
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some(Boolean));
}
