// Search highlighting over a rendered pdf.js text layer: wraps case-insensitive
// substring hits in <mark> elements. Matches spanning two text spans are not
// caught — acceptable for Phase 1, revisit with a real find controller later.
export function highlightTextLayer(
  container: HTMLElement,
  query: string | null
): void {
  const spans = container.querySelectorAll<HTMLElement>("span");
  for (const span of spans) {
    if (span.dataset.orig !== undefined) {
      span.textContent = span.dataset.orig;
      delete span.dataset.orig;
    }
  }
  const q = query?.toLowerCase();
  if (!q) return;
  for (const span of spans) {
    if (span.children.length > 0) continue; // marked-content wrappers
    const text = span.textContent ?? "";
    const lower = text.toLowerCase();
    let pos = lower.indexOf(q);
    if (pos === -1) continue;
    span.dataset.orig = text;
    const frag = document.createDocumentFragment();
    let i = 0;
    while (pos !== -1) {
      if (pos > i) frag.appendChild(document.createTextNode(text.slice(i, pos)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(pos, pos + q.length);
      frag.appendChild(mark);
      i = pos + q.length;
      pos = lower.indexOf(q, i);
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    span.replaceChildren(frag);
  }
}
