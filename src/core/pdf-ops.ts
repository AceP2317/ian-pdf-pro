// Pure pdf-lib document surgery. No pdf.js, no DOM — runs in any JS host,
// which keeps these ops testable outside the webview.
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { addAnnotationToPage } from "./annotations";
import type { AnnotationSpec } from "./annotations";

export type Rotation = 0 | 90 | 180 | 270;

export interface PageEntry {
  srcIndex: number; // 0-based page index in the source document
  extraRotation: Rotation; // user rotation on top of the page's own /Rotate
}

export interface PlacedAnnotation {
  srcIndex: number; // page of the SOURCE document the annotation sits on
  spec: AnnotationSpec;
}

export function identityPages(numPages: number): PageEntry[] {
  return Array.from({ length: numPages }, (_, i) => ({
    srcIndex: i,
    extraRotation: 0,
  }));
}

// Build a new PDF from `bytes` with pages in `pages` order and rotation,
// writing `annotations` onto their pages. Annotations whose srcIndex is not
// in `pages` are dropped with their page. Also used for extraction: pass a
// subset of entries.
export async function materialize(
  bytes: Uint8Array,
  pages: PageEntry[],
  annotations: PlacedAnnotation[] = []
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("Cannot save a PDF with no pages");
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  copyMetadata(src, out);
  const copied = await out.copyPages(
    src,
    pages.map((p) => p.srcIndex)
  );
  const now = new Date();
  copied.forEach((page, i) => {
    const extra = pages[i].extraRotation;
    if (extra !== 0) {
      page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    }
    out.addPage(page);
    for (const placed of annotations) {
      if (placed.srcIndex === pages[i].srcIndex) {
        addAnnotationToPage(out, page, placed.spec, now);
      }
    }
  });
  return out.save();
}

// Append every page of each `others` document to `baseBytes`, in order.
export async function appendPdfs(
  baseBytes: Uint8Array,
  others: Uint8Array[]
): Promise<Uint8Array> {
  const out = await PDFDocument.load(baseBytes);
  for (const bytes of others) {
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  return out.save();
}

// Parse a 1-based page-range string like "1-3, 7, 12-9" against `max` pages.
// Returns 0-based indices in the order written; descending ranges reverse.
export function parsePageRanges(text: string, max: number): number[] {
  const out: number[] = [];
  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw new Error(`Invalid page range: "${part}"`);
    const a = parseInt(m[1], 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1 || a > max || b > max) {
      throw new Error(`Page out of bounds in "${part}" (document has ${max})`);
    }
    const step = a <= b ? 1 : -1;
    for (let p = a; p !== b + step; p += step) out.push(p - 1);
  }
  if (out.length === 0) throw new Error("No pages given");
  return out;
}

function copyMetadata(src: PDFDocument, out: PDFDocument): void {
  try {
    const title = src.getTitle();
    if (title) out.setTitle(title);
    const author = src.getAuthor();
    if (author) out.setAuthor(author);
    const subject = src.getSubject();
    if (subject) out.setSubject(subject);
    const creator = src.getCreator();
    if (creator) out.setCreator(creator);
  } catch {
    // malformed Info dict — not worth failing a save over
  }
}
