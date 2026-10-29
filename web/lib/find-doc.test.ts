import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDocs } from "./find-doc.ts";

const rows = [
  { no: "SO-10400", party: "王小明", item: "節慶黏土", qty: 2 },
  { no: "SO-10401", party: "Lin Mei", item: "木質相框", qty: 1 },
  { no: "AB-112", party: "陳先生", item: "SO-特殊品", qty: 4 },
];

describe("findDocs", () => {
  it("空白或空字串回傳全部", () => {
    assert.equal(findDocs("", rows), rows);
    assert.equal(findDocs("   ", rows), rows);
    assert.equal(findDocs("\n\t　", rows), rows);
    const empty: typeof rows = [];
    assert.equal(findDocs("", empty), empty);
  });

  it("比對單號、客人、品名，不分大小寫", () => {
    assert.deepEqual(
      findDocs("so-10400", rows).map((row) => row.no),
      ["SO-10400"],
    );
    assert.deepEqual(
      findDocs("  LIN MEI  ", rows).map((row) => row.party),
      ["Lin Mei"],
    );
    assert.deepEqual(
      findDocs("相框", rows).map((row) => row.item),
      ["木質相框"],
    );
    assert.equal(findDocs("so-10400", rows)[0], rows[0]);
    assert.equal(findDocs("黏土", rows)[0]?.qty, 2);
  });

  it("一個字可以落在任一欄，對不上就空，順序照原來的", () => {
    assert.deepEqual(
      findDocs("so-", rows).map((row) => row.no),
      ["SO-10400", "SO-10401", "AB-112"],
    );
    assert.deepEqual(findDocs("沒有這張", rows), []);
    assert.deepEqual(findDocs("陳", rows).map((row) => row.party), ["陳先生"]);
  });
});
