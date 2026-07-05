// Phase-0 environment spike. Verifies the four capabilities every later
// feature depends on, inside the real webview (WebView2 / Android WebView):
//   1. pure-JS PDF creation (@cantoo/pdf-lib)
//   2. pdf.js rendering through a real module Worker (no fake-worker fallback)
//   3. WASM instantiation from a bundled asset via instantiate(arrayBuffer)
//      (instantiateStreaming is unreliable under Tauri's custom scheme)
//   4. IPC round-trip to the Rust shell
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { invoke } from "@tauri-apps/api/core";

export interface SpikeResult {
  name: string;
  pass: boolean;
  detail: string;
}

export async function runSpike(
  canvas: HTMLCanvasElement
): Promise<SpikeResult[]> {
  const results: SpikeResult[] = [];
  let pdfBytes: Uint8Array | null = null;

  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Ian PDF Pro spike OK", { x: 40, y: 100, size: 18, font });
    pdfBytes = await doc.save();
    results.push({
      name: "pdf-lib create/save",
      pass: pdfBytes.length > 500,
      detail: `${pdfBytes.length} bytes`,
    });
  } catch (e) {
    results.push({ name: "pdf-lib create/save", pass: false, detail: String(e) });
  }

  try {
    // Construct the worker explicitly so a failure throws here instead of
    // pdf.js silently degrading to its main-thread "fake worker".
    const worker = new Worker(pdfWorkerUrl, { type: "module" });
    pdfjsLib.GlobalWorkerOptions.workerPort = worker;
    if (!pdfBytes) throw new Error("no PDF bytes from previous step");
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
    const loaded = await loadingTask.promise;
    const page = await loaded.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    results.push({
      name: "pdf.js render via real Worker",
      pass: loaded.numPages === 1,
      detail: `rendered ${canvas.width}x${canvas.height}`,
    });
    await loadingTask.destroy();
  } catch (e) {
    results.push({ name: "pdf.js render via real Worker", pass: false, detail: String(e) });
  }

  try {
    const resp = await fetch("/spike.wasm");
    const bytes = await resp.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes);
    const add = instance.exports.add as (a: number, b: number) => number;
    const sum = add(2, 3);
    results.push({
      name: "WASM asset instantiate",
      pass: sum === 5,
      detail: `add(2,3) = ${sum}`,
    });
  } catch (e) {
    results.push({ name: "WASM asset instantiate", pass: false, detail: String(e) });
  }

  try {
    const path = await invoke<string>("report_spike", {
      result: JSON.stringify(results),
    });
    results.push({ name: "Rust IPC round-trip", pass: true, detail: path });
  } catch (e) {
    results.push({ name: "Rust IPC round-trip", pass: false, detail: String(e) });
  }

  return results;
}
