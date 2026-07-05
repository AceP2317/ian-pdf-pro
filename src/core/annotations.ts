// Annotation writer: builds standard PDF annotation dictionaries WITH
// appearance streams (/AP /N), so highlights and notes render in viewers
// that never regenerate appearances (Edge, Firefox) and stay editable in
// Adobe Reader (/T, /Contents, /NM, /M all populated).
//
// Pure pdf-lib — no DOM. Coordinates are PDF user space (y-up, points),
// always in the page's UNROTATED coordinate system: /Rotate only affects
// display, so quads survive page rotation untouched.
import {
  PDFDocument,
  PDFPage,
  PDFName,
  PDFDict,
  PDFString,
} from "@cantoo/pdf-lib";

export interface RGB {
  r: number; // 0..1
  g: number;
  b: number;
}

export interface PdfRect {
  x: number; // lower-left, PDF space
  y: number;
  w: number;
  h: number;
}

export interface HighlightSpec {
  type: "highlight";
  quads: PdfRect[]; // one axis-aligned rect per selected line fragment
  color: RGB;
  contents: string;
  author: string;
  id: string; // becomes /NM
}

export interface NoteSpec {
  type: "note";
  x: number; // lower-left of the 20x20 icon, PDF space
  y: number;
  color: RGB;
  contents: string;
  author: string;
  id: string;
}

export type AnnotationSpec = HighlightSpec | NoteSpec;

export const NOTE_ICON_SIZE = 20;

export function addAnnotationToPage(
  doc: PDFDocument,
  page: PDFPage,
  spec: AnnotationSpec,
  now: Date = new Date()
): void {
  if (spec.type === "highlight") {
    addHighlight(doc, page, spec, now);
  } else {
    addNote(doc, page, spec, now);
  }
}

function addHighlight(
  doc: PDFDocument,
  page: PDFPage,
  spec: HighlightSpec,
  now: Date
): void {
  if (spec.quads.length === 0) return;
  const ctx = doc.context;
  const rect = union(spec.quads);
  // QuadPoints order per widely-interoperable convention: TL TR BL BR
  const quadPoints = spec.quads.flatMap((q) => [
    q.x, q.y + q.h,
    q.x + q.w, q.y + q.h,
    q.x, q.y,
    q.x + q.w, q.y,
  ]);
  const ap = ctx.register(
    ctx.stream(
      [
        "/GS0 gs",
        `${fmt(spec.color.r)} ${fmt(spec.color.g)} ${fmt(spec.color.b)} rg`,
        ...spec.quads.map(
          (q) => `${fmt(q.x)} ${fmt(q.y)} ${fmt(q.w)} ${fmt(q.h)} re f`
        ),
      ].join("\n"),
      {
        Type: "XObject",
        Subtype: "Form",
        FormType: 1,
        BBox: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
        Group: { Type: "Group", S: "Transparency" },
        Resources: {
          ExtGState: {
            GS0: { Type: "ExtGState", BM: "Multiply", CA: 1, ca: 1 },
          },
        },
      }
    )
  );
  const annot = ctx.obj({
    Type: "Annot",
    Subtype: "Highlight",
    Rect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
    QuadPoints: quadPoints,
    C: [spec.color.r, spec.color.g, spec.color.b],
    CA: 1,
    F: 4,
    NM: PDFString.of(spec.id),
    T: PDFString.of(spec.author),
    Contents: PDFString.of(spec.contents),
    M: PDFString.of(pdfDate(now)),
    CreationDate: PDFString.of(pdfDate(now)),
    AP: { N: ap },
  }) as PDFDict;
  page.node.addAnnot(ctx.register(annot));
}

function addNote(
  doc: PDFDocument,
  page: PDFPage,
  spec: NoteSpec,
  now: Date
): void {
  const ctx = doc.context;
  const s = NOTE_ICON_SIZE;
  const ap = ctx.register(
    ctx.stream(noteIconOps(spec.color), {
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: [0, 0, s, s],
      Resources: {},
    })
  );
  const annot = ctx.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [spec.x, spec.y, spec.x + s, spec.y + s],
    Contents: PDFString.of(spec.contents),
    Name: "Comment",
    C: [spec.color.r, spec.color.g, spec.color.b],
    CA: 1,
    F: 4,
    Open: false,
    NM: PDFString.of(spec.id),
    T: PDFString.of(spec.author),
    M: PDFString.of(pdfDate(now)),
    CreationDate: PDFString.of(pdfDate(now)),
    AP: { N: ap },
  }) as PDFDict;
  const annotRef = ctx.register(annot);
  const popup = ctx.obj({
    Type: "Annot",
    Subtype: "Popup",
    Rect: [spec.x + s + 4, spec.y - 80, spec.x + s + 184, spec.y + s],
    Parent: annotRef,
    Open: false,
    F: 28,
  }) as PDFDict;
  const popupRef = ctx.register(popup);
  annot.set(PDFName.of("Popup"), popupRef);
  page.node.addAnnot(annotRef);
  page.node.addAnnot(popupRef);
}

// Speech-bubble icon drawn into a 20x20 box: filled rounded body, tail,
// three text lines. B = fill+stroke, S = stroke.
function noteIconOps(color: RGB): string {
  const k = 2.5 * 0.5523; // bezier kappa for r=2.5
  return [
    "1 w",
    `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg`,
    "0.25 0.2 0.05 RG",
    // rounded rect body: (1,6) to (19,19), r=2.5
    "3.5 6 m",
    "16.5 6 l",
    `${fmt(16.5 + k)} 6 19 ${fmt(8.5 - k)} 19 8.5 c`,
    "19 16.5 l",
    `19 ${fmt(16.5 + k)} ${fmt(16.5 + k)} 19 16.5 19 c`,
    "3.5 19 l",
    `${fmt(3.5 - k)} 19 1 ${fmt(16.5 + k)} 1 16.5 c`,
    "1 8.5 l",
    `1 ${fmt(8.5 - k)} ${fmt(3.5 - k)} 6 3.5 6 c`,
    "h B",
    // tail
    "5 6.5 m 9.5 6.5 l 5.5 1.5 l h B",
    // text lines
    "0.25 0.2 0.05 RG 0.8 w",
    "4.5 15.5 m 15.5 15.5 l S",
    "4.5 12.5 m 15.5 12.5 l S",
    "4.5 9.5 m 11.5 9.5 l S",
  ].join("\n");
}

function union(quads: PdfRect[]): PdfRect {
  const x1 = Math.min(...quads.map((q) => q.x));
  const y1 = Math.min(...quads.map((q) => q.y));
  const x2 = Math.max(...quads.map((q) => q.x + q.w));
  const y2 = Math.max(...quads.map((q) => q.y + q.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}
