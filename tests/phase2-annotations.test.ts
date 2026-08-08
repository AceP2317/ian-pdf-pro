// Phase 2 — core/annotations.ts: dict structure, AP streams, popup linkage, reorder-following,
// and a pdf.js parse asserting hasAppearance. The five sections are named for, and ordered as,
// the five areas the original claim listed, so the mapping is readable without a key.
//
// RECONSTRUCTED, NOT RESTORED. docs/BUILD_PLAN.md recorded Phase 2 as "26-check Node suite
// passed", and commit 529bc62 repeats that number. That suite is not in this repo and never was.
// This file was written FRESH from the five area names the claim listed. It is a DIFFERENT suite;
// its count is not 26 by design or by coincidence, and the original 26 are unrecoverable because
// there is no artifact to compare against.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, decodePDFRawStream,
} from "@cantoo/pdf-lib";
import {
  readFixture, loadDoc, annotsOn, dictName, HL, NOTE, NOW, AUTHOR, ROOT,
} from "./helpers/pdf.ts";
import { identityPages, materialize, type PageEntry } from "../src/core/pdf-ops.ts";
import { NOTE_ICON_SIZE } from "../src/core/annotations.ts";

const FIXTURE = readFixture("test-100-pages.pdf");
const entry = (srcIndex: number): PageEntry => ({ srcIndex, extraRotation: 0 });

/** Build a small annotated document: highlight on source page 0, note on source page 1. */
async function annotated(pages: PageEntry[] = identityPages(3)) {
  const bytes = await materialize(FIXTURE, pages, [
    { srcIndex: 0, spec: HL },
    { srcIndex: 1, spec: NOTE },
  ]);
  return { bytes, doc: await loadDoc(bytes) };
}

function num(d: PDFDict, key: string): number | undefined {
  const v = d.get(PDFName.of(key)) as { asNumber?: () => number } | undefined;
  return v?.asNumber?.();
}
function rect(d: PDFDict, key: string): number[] {
  const a = d.get(PDFName.of(key)) as PDFArray | undefined;
  if (!a) return [];
  return a.asArray().map((x) => (x as { asNumber: () => number }).asNumber());
}
function str(d: PDFDict, key: string): string | undefined {
  const v = d.get(PDFName.of(key)) as { decodeText?: () => string } | undefined;
  return v?.decodeText?.();
}

// ---------------------------------------------------------------- A. dict structure
test("A · dict structure", async (t) => {
  const { doc } = await annotated();
  const hl = annotsOn(doc, 0)[0];
  const [note] = annotsOn(doc, 1);

  await t.test("a highlight writes exactly one annotation", () => {
    assert.equal(annotsOn(doc, 0).length, 1);
  });
  await t.test("/Type /Annot and /Subtype /Highlight", () => {
    assert.equal(dictName(hl, "Type"), "/Annot");
    assert.equal(dictName(hl, "Subtype"), "/Highlight");
  });
  await t.test("/Rect is the union of the quads", () => {
    // quads: (72,700,120x14) and (72,680,80x14) -> x 72..192, y 680..714
    assert.deepEqual(rect(hl, "Rect"), [72, 680, 192, 714]);
  });
  await t.test("/QuadPoints has 8 numbers per quad", () => {
    assert.equal(rect(hl, "QuadPoints").length, 8 * HL.quads.length);
  });
  await t.test("/QuadPoints is in TL TR BL BR order", () => {
    const q = rect(hl, "QuadPoints").slice(0, 8);
    assert.deepEqual(q, [72, 714, 192, 714, 72, 700, 192, 700]);
  });
  await t.test("/C carries the spec colour", () => {
    assert.deepEqual(rect(hl, "C"), [HL.color.r, HL.color.g, HL.color.b]);
  });
  await t.test("/NM is the spec id, so the app can find its own annotation again", () => {
    assert.equal(str(hl, "NM"), HL.id);
  });
  await t.test("/T is the author and /Contents the body — both needed for Reader editability", () => {
    assert.equal(str(hl, "T"), AUTHOR);
    assert.equal(str(hl, "Contents"), HL.contents);
  });
  await t.test("/M and /CreationDate are PDF date strings built from the injected clock", () => {
    const m = str(hl, "M");
    assert.match(m ?? "", /^D:\d{14}Z$/);
    assert.equal(m, str(hl, "CreationDate"));
    assert.ok(m?.startsWith("D:20260808"), `expected the injected NOW, got ${m}`);
  });
  await t.test("/F is 4 (Print) on the highlight", () => {
    assert.equal(num(hl, "F"), 4);
  });
  await t.test("a note writes /Subtype /Text with a /Comment icon, closed", () => {
    assert.equal(dictName(note, "Subtype"), "/Text");
    assert.equal(dictName(note, "Name"), "/Comment");
    assert.equal(String(note.get(PDFName.of("Open"))), "false");
  });
  await t.test("the note icon is NOTE_ICON_SIZE square at the requested corner", () => {
    assert.deepEqual(rect(note, "Rect"),
      [NOTE.x, NOTE.y, NOTE.x + NOTE_ICON_SIZE, NOTE.y + NOTE_ICON_SIZE]);
  });
  await t.test("the note carries the same identity fields as the highlight", () => {
    assert.equal(str(note, "NM"), NOTE.id);
    assert.equal(str(note, "T"), AUTHOR);
    assert.equal(str(note, "Contents"), NOTE.contents);
  });
  await t.test("a highlight with ZERO quads writes nothing at all", async () => {
    const bytes = await materialize(FIXTURE, identityPages(2), [
      { srcIndex: 0, spec: { ...HL, quads: [] } },
    ]);
    assert.equal(annotsOn(await loadDoc(bytes), 0).length, 0);
  });
});

// ---------------------------------------------------------------- B. AP streams
test("B · appearance streams", async (t) => {
  const { doc } = await annotated();
  const hl = annotsOn(doc, 0)[0];
  const note = annotsOn(doc, 1)[0];

  const apOf = (d: PDFDict) => {
    const ap = doc.context.lookup(d.get(PDFName.of("AP"))) as PDFDict;
    return doc.context.lookup(ap.get(PDFName.of("N"))) as PDFRawStream;
  };
  const textOf = (s: PDFRawStream) => new TextDecoder().decode(decodePDFRawStream(s).decode());

  await t.test("the highlight has an /AP /N form XObject — without it Edge and Firefox draw nothing", () => {
    const n = apOf(hl);
    assert.ok(n, "no appearance stream");
    assert.equal(dictName(n.dict, "Subtype"), "/Form");
  });
  await t.test("the AP /BBox equals the annotation /Rect", () => {
    assert.deepEqual(rect(apOf(hl).dict, "BBox"), rect(hl, "Rect"));
  });
  await t.test("the AP declares a transparency group", () => {
    const g = doc.context.lookup(apOf(hl).dict.get(PDFName.of("Group"))) as PDFDict;
    assert.equal(dictName(g, "S"), "/Transparency");
  });
  await t.test("/Resources /ExtGState /GS0 sets /BM /Multiply, so text stays readable under the fill", () => {
    const res = doc.context.lookup(apOf(hl).dict.get(PDFName.of("Resources"))) as PDFDict;
    const eg = doc.context.lookup(res.get(PDFName.of("ExtGState"))) as PDFDict;
    const gs0 = doc.context.lookup(eg.get(PDFName.of("GS0"))) as PDFDict;
    assert.equal(dictName(gs0, "BM"), "/Multiply");
  });
  await t.test("the AP content is one `re f` per quad, at the quad's own coordinates", () => {
    const body = textOf(apOf(hl));
    assert.match(body, /72 700 120 14 re f/);
    assert.match(body, /72 680 80 14 re f/);
    assert.equal((body.match(/re f/g) ?? []).length, HL.quads.length);
  });
  await t.test("the AP sets the spec colour with rg", () => {
    assert.match(textOf(apOf(hl)), /1 0\.9 0\.2 rg/);
  });
  await t.test("the note's AP is a 20x20 icon", () => {
    assert.deepEqual(rect(apOf(note).dict, "BBox"), [0, 0, NOTE_ICON_SIZE, NOTE_ICON_SIZE]);
    assert.ok(textOf(apOf(note)).length > 0, "empty note appearance");
  });
});

// ---------------------------------------------------------------- C. popup linkage
test("C · popup linkage", async (t) => {
  const { doc } = await annotated();
  const onNote = annotsOn(doc, 1);

  await t.test("a note writes TWO annotations: the Text and its Popup, in that order", () => {
    assert.equal(onNote.length, 2);
    assert.equal(dictName(onNote[0], "Subtype"), "/Text");
    assert.equal(dictName(onNote[1], "Subtype"), "/Popup");
  });
  await t.test("the popup's /Parent is the Text annot and the Text annot's /Popup is the popup — a full round trip", () => {
    const textRef = doc.getPage(1).node.get(PDFName.of("Annots"));
    const arr = doc.context.lookup(textRef) as PDFArray;
    const refText = arr.get(0) as PDFRef;
    const refPopup = arr.get(1) as PDFRef;
    assert.equal(String(onNote[1].get(PDFName.of("Parent"))), String(refText));
    assert.equal(String(onNote[0].get(PDFName.of("Popup"))), String(refPopup));
  });
  await t.test("the popup is /F 28 and closed", () => {
    assert.equal(num(onNote[1], "F"), 28);
    assert.equal(String(onNote[1].get(PDFName.of("Open"))), "false");
  });
  await t.test("a highlight produces NO popup", () => {
    const onHl = annotsOn(doc, 0);
    assert.equal(onHl.length, 1);
    assert.equal(dictName(onHl[0], "Subtype"), "/Highlight");
  });
});

// ---------------------------------------------------------------- D. reorder-following
test("D · annotations follow their page through a reorder", async (t) => {
  await t.test("an annotation on source page 0 lands on output page 99 under full reversal — and NOWHERE else", async () => {
    const pages = Array.from({ length: 100 }, (_, i) => entry(99 - i));
    const bytes = await materialize(FIXTURE, pages, [{ srcIndex: 0, spec: HL }]);
    const doc = await loadDoc(bytes);
    assert.equal(annotsOn(doc, 99).length, 1);
    assert.equal(annotsOn(doc, 0).length, 0);
    let total = 0;
    for (const i of doc.getPageIndices()) total += annotsOn(doc, i).length;
    assert.equal(total, 1, "the annotation was written onto more than one page");
  });

  await t.test("a second annotation on source page 5 lands on output page 94 under the same reversal", async () => {
    const pages = Array.from({ length: 100 }, (_, i) => entry(99 - i));
    const bytes = await materialize(FIXTURE, pages, [{ srcIndex: 5, spec: NOTE }]);
    const doc = await loadDoc(bytes);
    assert.equal(annotsOn(doc, 94).length, 2, "expected the Text annot and its Popup");
  });

  await t.test("an annotation whose source page is NOT in the selection is dropped", async () => {
    const bytes = await materialize(FIXTURE, [entry(1), entry(2)], [{ srcIndex: 0, spec: HL }]);
    const doc = await loadDoc(bytes);
    assert.equal(annotsOn(doc, 0).length, 0);
    assert.equal(annotsOn(doc, 1).length, 0);
  });

  await t.test("annotations survive extraction onto the right output index", async () => {
    const bytes = await materialize(FIXTURE, [entry(9), entry(0), entry(4)], [{ srcIndex: 0, spec: HL }]);
    const doc = await loadDoc(bytes);
    assert.equal(annotsOn(doc, 1).length, 1);
    assert.equal(annotsOn(doc, 0).length, 0);
    assert.equal(annotsOn(doc, 2).length, 0);
  });

  // THE DEFECT THIS SUITE FOUND. pdf-lib's copyPages returns page nodes whose ENTRIES are shared
  // objects when the same source index is copied twice — harmless for /Type, /Resources,
  // /MediaBox and /Contents, and NOT harmless for /Annots, which addAnnotationToPage mutates.
  // Both output pages then point at one array and each write lands in both.
  // Reachable from the UI: store.ts's extractPages("1,1") produces exactly this input.
  await t.test("the SAME source page selected twice does not share one /Annots array", async () => {
    const bytes = await materialize(FIXTURE, [entry(0), entry(0)], [{ srcIndex: 0, spec: HL }]);
    const doc = await loadDoc(bytes);
    assert.equal(annotsOn(doc, 0).length, 1,
      "page 0 carries a duplicate — the two copies are writing into one shared /Annots array");
    assert.equal(annotsOn(doc, 1).length, 1,
      "page 1 carries a duplicate — the two copies are writing into one shared /Annots array");
  });
});

// ---------------------------------------------------------------- E. pdf.js parse
test("E · pdf.js reads them back, with appearances", async (t) => {
  const { bytes } = await annotated();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    // pdf.js validates this as a URL, not a path: it must use forward slashes and MUST end in
    // one. Windows path.sep produces a backslash and it rejects the whole thing with
    // "Invalid factory url ... must include trailing slash". Without it the run still works but
    // prints two UnknownErrorException warnings while loading standard fonts.
    standardFontDataUrl:
      pathToFileURL(path.join(ROOT, "node_modules", "pdfjs-dist", "standard_fonts")).href + "/",
  });
  const doc = await task.promise;

  await t.test("pdf.js opens the saved bytes and agrees on the page count", async () => {
    assert.equal(doc.numPages, 3);
  });

  await t.test("the highlight is a Highlight and pdf.js sees its appearance", async () => {
    const a = await (await doc.getPage(1)).getAnnotations();
    assert.equal(a.length, 1);
    assert.equal(a[0].subtype, "Highlight");
    assert.equal(a[0].hasAppearance, true,
      "no appearance means Edge and Firefox render nothing at all");
  });

  await t.test("author and contents survive the round trip as readable text", async () => {
    const a = await (await doc.getPage(1)).getAnnotations();
    assert.equal(a[0].titleObj?.str, AUTHOR);
    assert.equal(a[0].contentsObj?.str, HL.contents);
  });

  await t.test("quadPoints survive the round trip", async () => {
    const a = await (await doc.getPage(1)).getAnnotations();
    assert.ok(a[0].quadPoints, "pdf.js reports no quadPoints");
  });

  await t.test("the note is a Text with an appearance, and its Popup correctly has none", async () => {
    const a = await (await doc.getPage(2)).getAnnotations();
    assert.equal(a.length, 2);
    const text = a.find((x: { subtype: string }) => x.subtype === "Text");
    const popup = a.find((x: { subtype: string }) => x.subtype === "Popup");
    assert.ok(text && popup, "expected one Text and one Popup");
    assert.equal(text.hasAppearance, true);
    assert.equal(popup.hasAppearance, false, "a popup has no AP by design");
  });

  await t.test("pdf.js resolves the Text annot's popupRef", async () => {
    const a = await (await doc.getPage(2)).getAnnotations();
    const text = a.find((x: { subtype: string }) => x.subtype === "Text");
    assert.ok(text.popupRef, "popup linkage did not survive the round trip");
  });

  await task.destroy(); // destroy() is on the LOADING TASK, not the document proxy (pdfjs v6)
});
