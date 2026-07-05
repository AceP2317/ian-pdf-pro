// Turns the current browser text selection into per-page highlight quads
// in PDF user space, via the engine's viewport converters.
import * as engine from "../../core/pdf-engine";
import type { PdfRect } from "../../core/pdf-engine";
import type { PageState } from "../../store";

export interface CapturedHighlight {
  srcIndex: number;
  quads: PdfRect[];
}

export async function captureSelectionHighlights(
  pages: PageState[],
  zoom: number
): Promise<CapturedHighlight[]> {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return [];
  const rects: DOMRect[] = [];
  for (let r = 0; r < sel.rangeCount; r++) {
    rects.push(...Array.from(sel.getRangeAt(r).getClientRects()));
  }
  const out: CapturedHighlight[] = [];
  const pageEls = document.querySelectorAll<HTMLElement>(".page[data-page]");
  for (const el of pageEls) {
    const viewIndex = parseInt(el.dataset.page ?? "", 10) - 1;
    const page = pages[viewIndex];
    if (!page) continue;
    const pr = el.getBoundingClientRect();
    const local = rects.filter(
      (r) =>
        r.width > 0.5 &&
        r.height > 0.5 &&
        r.left >= pr.left - 1 &&
        r.right <= pr.right + 1 &&
        r.top >= pr.top - 1 &&
        r.bottom <= pr.bottom + 1
    );
    if (local.length === 0) continue;
    // browsers emit an extra border-box rect for fully-selected elements on
    // top of the text rects — drop rects that contain other rects
    const textRects = local.filter(
      (a) =>
        !local.some(
          (b) =>
            b !== a &&
            b.left >= a.left - 1 &&
            b.right <= a.right + 1 &&
            b.top >= a.top - 1 &&
            b.bottom <= a.bottom + 1 &&
            (b.width < a.width - 2 || b.height < a.height - 2)
        )
    );
    const conv = await engine.getPageConverters(
      page.srcIndex,
      zoom,
      page.extraRotation
    );
    const quads: PdfRect[] = [];
    for (const r of textRects) {
      const [ax, ay] = conv.cssToPdf(r.left - pr.left, r.top - pr.top);
      const [bx, by] = conv.cssToPdf(r.right - pr.left, r.bottom - pr.top);
      const q: PdfRect = {
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        w: Math.abs(bx - ax),
        h: Math.abs(by - ay),
      };
      if (q.w < 0.1 || q.h < 0.1) continue;
      if (!quads.some((e) => near(e, q))) quads.push(q);
    }
    if (quads.length > 0) out.push({ srcIndex: page.srcIndex, quads });
  }
  return out;
}

function near(a: PdfRect, b: PdfRect): boolean {
  return (
    Math.abs(a.x - b.x) < 1 &&
    Math.abs(a.y - b.y) < 1 &&
    Math.abs(a.w - b.w) < 1 &&
    Math.abs(a.h - b.h) < 1
  );
}
