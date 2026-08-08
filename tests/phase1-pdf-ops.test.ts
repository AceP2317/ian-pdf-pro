// Phase 1 — core/pdf-ops.ts: reorder, rotate, delete, merge, extract, page-range parsing.
//
// RECONSTRUCTED, NOT RESTORED. docs/BUILD_PLAN.md recorded Phase 1 as verified by "an automated
// Node suite over core/pdf-ops.ts". That suite is not in this repo and never was —
// `git log --all --diff-filter=AD` over *test*, *spec*, tests/* and scripts/* returns only the
// two fixture PDFs. It was run as a throwaway script and never committed. This file was written
// FRESH from that claim's own description. It is not the original, its check count is not the
// original's, and its results are evidence for the code as it stands today rather than for what
// was checked on 2026-07-05.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFixture, loadDoc, hashAll, pageHash, synthRotated,
} from "./helpers/pdf.ts";
import {
  identityPages, materialize, appendPdfs, parsePageRanges,
  type PageEntry, type Rotation,
} from "../src/core/pdf-ops.ts";

const FIXTURE = readFixture("test-100-pages.pdf");

const entry = (srcIndex: number, extraRotation: Rotation = 0): PageEntry => ({ srcIndex, extraRotation });

test("reorder — order is asserted by page identity, not by count", async (t) => {
  const src = await loadDoc(FIXTURE);
  const srcHashes = hashAll(src);

  await t.test("the fixture is 100 pages and every page is distinguishable", () => {
    assert.equal(src.getPageCount(), 100);
    assert.equal(new Set(srcHashes).size, 100,
      "if two pages hashed alike, every reorder assertion below would be vacuous");
  });

  await t.test("identityPages describes the document unchanged", () => {
    const p = identityPages(100);
    assert.equal(p.length, 100);
    assert.deepEqual(p[0], { srcIndex: 0, extraRotation: 0 });
    assert.deepEqual(p[99], { srcIndex: 99, extraRotation: 0 });
  });

  await t.test("identity materialize preserves count AND order", async () => {
    const out = await loadDoc(await materialize(FIXTURE, identityPages(100)));
    assert.equal(out.getPageCount(), 100);
    assert.deepEqual(hashAll(out), srcHashes);
  });

  await t.test("full reversal reverses the content, not just the count", async () => {
    const pages = Array.from({ length: 100 }, (_, i) => entry(99 - i));
    const out = await loadDoc(await materialize(FIXTURE, pages));
    assert.equal(out.getPageCount(), 100);
    assert.deepEqual(hashAll(out), [...srcHashes].reverse());
  });

  await t.test("an arbitrary permutation lands page-for-page", async () => {
    const order = [7, 0, 42, 99, 13, 1];
    const out = await loadDoc(await materialize(FIXTURE, order.map((i) => entry(i))));
    assert.deepEqual(hashAll(out), order.map((i) => srcHashes[i]));
  });
});

test("delete — the removed page is gone and its neighbours close up", async (t) => {
  const src = await loadDoc(FIXTURE);
  const srcHashes = hashAll(src);

  await t.test("deleting one page yields 99, without that page", async () => {
    const kept = identityPages(100).filter((p) => p.srcIndex !== 5);
    const out = await loadDoc(await materialize(FIXTURE, kept));
    assert.equal(out.getPageCount(), 99);
    assert.ok(!hashAll(out).includes(srcHashes[5]), "the deleted page's content is still present");
  });

  await t.test("the page after the deletion shifts into its index", async () => {
    const kept = identityPages(100).filter((p) => p.srcIndex !== 5);
    const out = await loadDoc(await materialize(FIXTURE, kept));
    assert.equal(pageHash(out, 5), srcHashes[6]);
    assert.equal(pageHash(out, 4), srcHashes[4], "pages before the deletion must not move");
  });

  await t.test("deleting a contiguous block removes exactly that block", async () => {
    const kept = identityPages(100).filter((p) => p.srcIndex < 10 || p.srcIndex > 19);
    const out = await loadDoc(await materialize(FIXTURE, kept));
    assert.equal(out.getPageCount(), 90);
    const h = hashAll(out);
    for (let i = 10; i <= 19; i++) assert.ok(!h.includes(srcHashes[i]), `page ${i} survived`);
    assert.equal(h[10], srcHashes[20]);
  });

  await t.test("materialize refuses an empty page list, by message", async () => {
    await assert.rejects(() => materialize(FIXTURE, []), /Cannot save a PDF with no pages/);
  });
});

test("extract — a subset in the order requested", async (t) => {
  const srcHashes = hashAll(await loadDoc(FIXTURE));

  await t.test("extracting [3,1,7] gives three pages in THAT order", async () => {
    const out = await loadDoc(await materialize(FIXTURE, [3, 1, 7].map((i) => entry(i))));
    assert.equal(out.getPageCount(), 3);
    assert.deepEqual(hashAll(out), [srcHashes[3], srcHashes[1], srcHashes[7]]);
  });

  await t.test("extraction composes with parsePageRanges", async () => {
    const idx = parsePageRanges("4,2,8", 100);
    const out = await loadDoc(await materialize(FIXTURE, idx.map((i) => entry(i))));
    assert.deepEqual(hashAll(out), [srcHashes[3], srcHashes[1], srcHashes[7]]);
  });
});

test("rotate — extra rotation composes with the page's own /Rotate", async (t) => {
  // The committed fixture is /Rotate 0 throughout, so intrinsic composition is exercised
  // against a synthesized document. See helpers/pdf.ts.
  const rotated = await synthRotated();
  const intrinsic = [0, 90, 180, 270] as const;

  await t.test("the synthesized fixture really carries four distinct intrinsic rotations", async () => {
    const d = await loadDoc(rotated);
    assert.deepEqual(d.getPages().map((p) => p.getRotation().angle), [0, 90, 180, 270]);
  });

  await t.test("extra 0 leaves the intrinsic rotation untouched", async () => {
    const pages = intrinsic.map((_, i) => entry(i, 0));
    const out = await loadDoc(await materialize(rotated, pages));
    assert.deepEqual(out.getPages().map((p) => p.getRotation().angle), [0, 90, 180, 270]);
  });

  for (const extra of [90, 180, 270] as const) {
    await t.test(`extra ${extra} composes across the whole intrinsic matrix`, async () => {
      const pages = intrinsic.map((_, i) => entry(i, extra));
      const out = await loadDoc(await materialize(rotated, pages));
      assert.deepEqual(
        out.getPages().map((p) => p.getRotation().angle),
        intrinsic.map((r) => (r + extra) % 360),
        "composition must be (intrinsic + extra) mod 360"
      );
    });
  }

  await t.test("rotation wraps rather than exceeding 360", async () => {
    const out = await loadDoc(await materialize(rotated, [entry(3, 270)])); // 270 + 270
    assert.equal(out.getPage(0).getRotation().angle, 180);
  });

  await t.test("rotating a page does not change which page it is", async () => {
    const srcHashes = hashAll(await loadDoc(FIXTURE));
    const out = await loadDoc(await materialize(FIXTURE, [entry(9, 90)]));
    assert.equal(pageHash(out, 0), srcHashes[9]);
  });
});

test("merge — appendPdfs concatenates in order", async (t) => {
  const other = readFixture("test-100-pages-reordered.pdf");
  const baseHashes = hashAll(await loadDoc(FIXTURE));
  const otherHashes = hashAll(await loadDoc(other));

  await t.test("base + one other is 200 pages with both ranges intact", async () => {
    const out = await loadDoc(await appendPdfs(FIXTURE, [other]));
    assert.equal(out.getPageCount(), 200);
    const h = hashAll(out);
    assert.deepEqual(h.slice(0, 100), baseHashes);
    assert.deepEqual(h.slice(100), otherHashes);
  });

  await t.test("appending three documents keeps document order", async () => {
    const small = await materialize(FIXTURE, [entry(0)]);
    const out = await loadDoc(await appendPdfs(small, [small, small]));
    assert.equal(out.getPageCount(), 3);
    assert.deepEqual(hashAll(out), [baseHashes[0], baseHashes[0], baseHashes[0]]);
  });

  await t.test("appending nothing is a no-op", async () => {
    const out = await loadDoc(await appendPdfs(FIXTURE, []));
    assert.equal(out.getPageCount(), 100);
  });
});

test("metadata survives materialize", async (t) => {
  const src = await loadDoc(FIXTURE);
  const title = src.getTitle();
  const creator = src.getCreator();

  await t.test("the fixture actually carries metadata to preserve", () => {
    assert.ok(title, "fixture has no /Title — the arm below would pass vacuously");
  });

  await t.test("Title and Creator are carried into the new document", async () => {
    const out = await loadDoc(await materialize(FIXTURE, identityPages(3)));
    assert.equal(out.getTitle(), title);
    if (creator) assert.equal(out.getCreator(), creator);
  });
});

test("parsePageRanges", async (t) => {
  await t.test("mixed ranges, singletons and a DESCENDING range", () => {
    assert.deepEqual(parsePageRanges("1-3, 7, 12-9", 100), [0, 1, 2, 6, 11, 10, 9, 8]);
  });
  await t.test("1-based in, 0-based out", () => {
    assert.deepEqual(parsePageRanges("1", 10), [0]);
    assert.deepEqual(parsePageRanges("10", 10), [9]);
  });
  await t.test("below the low bound throws", () => {
    assert.throws(() => parsePageRanges("0", 10), /Page out of bounds/);
  });
  await t.test("above the high bound throws", () => {
    assert.throws(() => parsePageRanges("11", 10), /Page out of bounds/);
  });
  await t.test("malformed input throws, naming the part", () => {
    assert.throws(() => parsePageRanges("1-", 10), /Invalid page range/);
    assert.throws(() => parsePageRanges("abc", 10), /Invalid page range/);
  });
  await t.test("an empty selection throws rather than returning []", () => {
    assert.throws(() => parsePageRanges("", 10), /No pages given/);
    assert.throws(() => parsePageRanges(" , , ", 10), /No pages given/);
  });
});
