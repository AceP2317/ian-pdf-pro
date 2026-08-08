// Shared fixtures and inspection helpers for the Phase 1 and Phase 2 suites.
//
// Imported with EXPLICIT .ts extensions so the resolve hook's blast radius stays confined to
// src/, where the extensionless imports actually live.
//
// THE ONE RULE THESE SUITES MUST HOLD: import src/core/pdf-ops.ts and src/core/annotations.ts
// DIRECTLY, never src/core/pdf-engine.ts. That facade re-exports both pure modules, so reaching
// them through it drags in `new Worker`, window.devicePixelRatio, document.createElement and a
// Vite-only "?url" specifier Node cannot resolve. It is importable in the app and not here.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  degrees,
} from "@cantoo/pdf-lib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");
export const FIXTURES = path.join(ROOT, "fixtures");

export function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));
}

// PAGE IDENTITY. A page COUNT is not an order proof — reversing a document and asserting it
// still has 100 pages passes just as well if nothing moved. Fingerprinting each page by the
// SHA-1 of its decoded content stream turns "the pages are in this exact order" into something
// checkable with pdf-lib alone. Measured on the committed fixture: all 100 pages hash
// distinctly, which is what makes exact-permutation assertions meaningful here.
export function pageHash(doc: PDFDocument, i: number): string {
  const page = doc.getPage(i);
  const c = page.node.Contents();
  const stream = c instanceof PDFArray ? doc.context.lookup(c.get(0)) : c;
  const bytes = decodePDFRawStream(stream as PDFRawStream).decode();
  return crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 12);
}

export function hashAll(doc: PDFDocument): string[] {
  return doc.getPageIndices().map((i) => pageHash(doc, i));
}

export async function loadDoc(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes);
}

// Resolve a page's /Annots array to the annotation dictionaries themselves.
export function annotsOn(doc: PDFDocument, i: number): PDFDict[] {
  const raw = doc.getPage(i).node.get(PDFName.of("Annots"));
  if (!raw) return [];
  const arr = doc.context.lookup(raw) as PDFArray;
  if (!arr || typeof arr.size !== "function") return [];
  const out: PDFDict[] = [];
  for (let k = 0; k < arr.size(); k++) out.push(doc.context.lookup(arr.get(k)) as PDFDict);
  return out;
}

export function dictName(d: PDFDict, key: string): string | undefined {
  const v = d.get(PDFName.of(key));
  return v ? String(v) : undefined;
}

// THE ROTATION FIXTURE IS SYNTHESIZED, AND THAT IS A CORRECTION TO THE ORIGINAL CLAIM.
// BUILD_PLAN.md's Phase 1 line says the suite covered "intrinsic-/Rotate composition", but
// fixtures/test-100-pages.pdf carries /Rotate 0 on all 100 pages — measured, one distinct
// value — so that property cannot be exercised against the committed file at all. This builds
// a four-page document carrying 0/90/180/270 so the composition matrix has something real to
// compose against.
export async function synthRotated(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const r of [0, 90, 180, 270]) {
    const p = doc.addPage([200, 300]);
    p.setRotation(degrees(r));
    p.drawText(`intrinsic ${r}`, { x: 20, y: 150, size: 12 });
  }
  return doc.save();
}

export const AUTHOR = "Ian";

// A fixed `now` so /M and /CreationDate are deterministic and can be asserted exactly.
export const NOW = new Date(Date.UTC(2026, 7, 8, 14, 4, 28));

export const HL = {
  type: "highlight" as const,
  quads: [
    { x: 72, y: 700, w: 120, h: 14 },
    { x: 72, y: 680, w: 80, h: 14 },
  ],
  color: { r: 1, g: 0.9, b: 0.2 },
  contents: "hl body",
  author: AUTHOR,
  id: "hl-1",
};

export const NOTE = {
  type: "note" as const,
  x: 300,
  y: 500,
  color: { r: 1, g: 0.85, b: 0.3 },
  contents: "note body",
  author: AUTHOR,
  id: "nt-1",
};
