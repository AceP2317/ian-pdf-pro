// Facade over pdf.js (render, text, search) and pdf-lib (document surgery).
// Every feature goes through this module — nothing else imports pdfjs-dist.
//
// Lifecycle doctrine (Android WebView memory is risk #1): one document and
// one worker alive at a time; loading a new document destroys the previous
// loading task AND terminates its worker; thumbnails are blob URLs, not
// retained canvases; page canvases are capped in pixel area.
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export * from "./pdf-ops";

export interface PageDim {
  width: number; // unrotated media box, PDF units at scale 1
  height: number;
  rotate: number; // intrinsic /Rotate of the page
}

export interface SearchMatch {
  srcIndex: number;
  count: number;
  snippet: string;
}

// 4096 x 4096 — safe ceiling for Android WebView canvas allocations
const MAX_CANVAS_PIXELS = 16_777_216;
const THUMB_WIDTH = 140;

let worker: Worker | null = null;
let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
let doc: PDFDocumentProxy | null = null;
const textCache = new Map<number, string>();
const thumbCache = new Map<string, string | Promise<string>>();

export async function loadDocument(
  bytes: Uint8Array
): Promise<{ numPages: number; dims: PageDim[] }> {
  await closeDocument();
  worker = new Worker(pdfWorkerUrl, { type: "module" });
  pdfjsLib.GlobalWorkerOptions.workerPort = worker;
  // slice(): pdf.js transfers the buffer to the worker, detaching the original
  loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  doc = await loadingTask.promise;
  const dims: PageDim[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [x1, y1, x2, y2] = page.view;
    dims.push({ width: x2 - x1, height: y2 - y1, rotate: page.rotate });
  }
  return { numPages: doc.numPages, dims };
}

export async function closeDocument(): Promise<void> {
  textCache.clear();
  for (const entry of thumbCache.values()) {
    if (typeof entry === "string") URL.revokeObjectURL(entry);
  }
  thumbCache.clear();
  if (loadingTask) {
    try {
      await loadingTask.destroy();
    } catch {
      // already torn down
    }
    loadingTask = null;
    doc = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export interface RenderJob {
  promise: Promise<void>;
  cancel: () => void;
}

// Render one page into `canvas` (device-pixel sharp, area-capped) and, when
// `textLayerDiv` is given, lay a selectable pdf.js text layer over it.
export function renderPageToCanvas(
  srcIndex: number,
  canvas: HTMLCanvasElement,
  textLayerDiv: HTMLElement | null,
  scale: number,
  extraRotation: number
): RenderJob {
  let cancelled = false;
  let renderTask: RenderTask | null = null;
  let textLayer: TextLayer | null = null;

  const promise = (async () => {
    if (!doc) return;
    const page = await doc.getPage(srcIndex + 1);
    if (cancelled) return;
    const rotation = (page.rotate + extraRotation) % 360;
    const cssViewport = page.getViewport({ scale, rotation });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let renderScale = scale * dpr;
    const area = cssViewport.width * cssViewport.height * dpr * dpr;
    if (area > MAX_CANVAS_PIXELS) {
      renderScale = scale * Math.sqrt(MAX_CANVAS_PIXELS / (cssViewport.width * cssViewport.height));
    }
    const canvasViewport = page.getViewport({ scale: renderScale, rotation });
    canvas.width = Math.floor(canvasViewport.width);
    canvas.height = Math.floor(canvasViewport.height);
    canvas.style.width = `${Math.floor(cssViewport.width)}px`;
    canvas.style.height = `${Math.floor(cssViewport.height)}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderTask = page.render({
      canvas,
      canvasContext: ctx,
      viewport: canvasViewport,
    });
    await renderTask.promise;
    if (cancelled || !textLayerDiv) return;
    textLayerDiv.replaceChildren();
    textLayerDiv.style.setProperty("--scale-factor", String(scale));
    textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textLayerDiv,
      viewport: cssViewport,
    });
    await textLayer.render();
  })().catch((err: unknown) => {
    if (!cancelled && (err as Error)?.name !== "RenderingCancelledException") {
      throw err;
    }
  });

  return {
    promise,
    cancel() {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    },
  };
}

// Thumbnail as a blob URL, cached per (page, rotation). The backing canvas
// is released immediately after encoding.
export function renderThumbnail(
  srcIndex: number,
  extraRotation: number
): Promise<string> {
  const key = `${srcIndex}:${extraRotation}`;
  const hit = thumbCache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = (async () => {
    if (!doc) throw new Error("no document");
    const page = await doc.getPage(srcIndex + 1);
    const rotation = (page.rotate + extraRotation) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const viewport = page.getViewport({
      scale: THUMB_WIDTH / base.width,
      rotation,
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("thumbnail encode failed");
    const url = URL.createObjectURL(blob);
    thumbCache.set(key, url);
    return url;
  })();
  thumbCache.set(key, job);
  job.catch(() => thumbCache.delete(key));
  return job;
}

export async function getPageText(srcIndex: number): Promise<string> {
  const hit = textCache.get(srcIndex);
  if (hit !== undefined) return hit;
  if (!doc) return "";
  const page = await doc.getPage(srcIndex + 1);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) =>
      "str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""
    )
    .join("");
  textCache.set(srcIndex, text);
  return text;
}

export async function searchPages(
  query: string,
  srcIndices: number[]
): Promise<SearchMatch[]> {
  const q = query.toLowerCase();
  if (!q) return [];
  const out: SearchMatch[] = [];
  for (const srcIndex of srcIndices) {
    const text = await getPageText(srcIndex);
    const lower = text.toLowerCase();
    let count = 0;
    const first = lower.indexOf(q);
    let pos = first;
    while (pos !== -1) {
      count++;
      pos = lower.indexOf(q, pos + q.length);
    }
    if (count > 0) {
      out.push({ srcIndex, count, snippet: makeSnippet(text, first, q.length) });
    }
  }
  return out;
}

function makeSnippet(text: string, at: number, len: number): string {
  const start = Math.max(0, at - 32);
  const end = Math.min(text.length, at + len + 32);
  const raw = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${raw}${end < text.length ? "…" : ""}`;
}
