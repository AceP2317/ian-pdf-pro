# Ian PDF Pro — Master Build Plan

Approved 2026-07-05 (originally under an interim working name; renamed same day). Phase 0 complete.

## Scope

A self-owned Adobe-Acrobat-Pro-style PDF suite:

- **Full feature ambition**: viewer + page organizer, annotate & comment, fill & sign, OCR & convert, plus Pro-tier extras (encrypt/decrypt, redaction, watermarks/page numbers, compare, metadata, limited text edit, camera-scan on mobile).
- **Targets**: installable Windows 10/11 desktop app AND a native Android APK distributed by direct side-load (no Play Store).
- **Distributed to colleagues** → permissive licenses only (MIT/Apache/BSD/ISC). No AGPL (PyMuPDF, Ghostscript), no commercial SDKs.

**Honest scope cuts:** full reflow text editing (nobody clones this well — same-font, same-line edits only), Office→PDF in v1 (later, desktop-only, via user-installed LibreOffice), certified cryptographic signatures (drawn/typed signatures only, not PKI), guaranteed PDF/A conformance (best-effort validation only).

## Stack (decided)

**Tauri v2** — one React/TypeScript codebase, one Rust shell, builds both the Windows NSIS installer and the signed Android APK. Chosen over Electron+Capacitor (two shells, double glue) and Flutter (permissive PDF ecosystem too thin). Both target webviews are Chromium-based, so pdf.js workers and WASM run on both.

| Concern | Library | License |
|---|---|---|
| Render / text layer / search / thumbnails | `pdfjs-dist` | Apache-2.0 |
| Page ops, forms, watermarks, image↔PDF, **encryption** | `@cantoo/pdf-lib` (maintained fork; `save({userPassword,...})` verified) | MIT |
| Encryption fallback, object cleanup | `@neslinesli93/qpdf-wasm` | Apache-2.0 |
| Annotations | **Own module** — write standard annot dictionaries + appearance streams via pdf-lib low-level API (pdf-lib has no high-level annot API; `pdfAnnotate` MIT as reference) | MIT (own) |
| OCR | `tesseract.js` v7 + invisible text layer | Apache-2.0 |
| Signature pad | `signature_pad` | MIT |
| Compare | pdf.js render → `pixelmatch` diff | ISC |
| Compression | Own: extract images → canvas downsample/JPEG re-encode → re-embed; qpdf object-streams pass | — |
| Redaction | V1: rasterize redacted page (provably removes content). V2: content-stream glyph removal, gated by a post-redaction text-extraction assertion | — |
| UI | React + Vite + Zustand | MIT |

## Project structure

```
Ian PDF Pro/
├── src/                    # React UI — 100% shared between Windows & Android
│   ├── features/           # viewer/ organizer/ annotate/ forms/ ocr/ secure/ compare/
│   ├── core/               # pdf-engine.ts (facade), annotations.ts, redaction.ts, compress.ts, ocr.ts
│   ├── platform/           # fs.ts, dialogs.ts — ONLY platform-aware layer (Tauri plugins)
│   └── workers/            # pdf.js worker, tesseract pool, qpdf-wasm (all bundled locally, no CDN)
├── src-tauri/              # Rust shell: file I/O commands, temp files
│   ├── gen/android/        # generated Android project (release signing config)
│   └── tauri.conf.json     # bundle: nsis + msi; android; CSP (wasm-unsafe-eval, blob workers)
└── docs/DISTRIBUTION.md    # colleague install + update instructions (Phase 6)
```

Key files: `src/core/pdf-engine.ts` (every feature goes through this facade), `src/core/annotations.ts` (highest-skill module), `src/platform/fs.ts` (Windows paths vs Android SAF isolation), `src-tauri/tauri.conf.json`.

## Phases

**Phase 0 — Toolchain + scaffold + spike: ✅ COMPLETE (2026-07-05)**
Node 24, Rust stable MSVC + Android targets, portable JDK 17, Android SDK/NDK, VS Build Tools 2026 (preexisting). Tauri scaffold, CSP configured, WASM/worker spike PASSED on Windows in dev AND release (custom scheme) modes; unsigned aarch64 APK built. Outstanding: on-device Android spike (signed test APK in `dist-test/`, needs user's phone).

**Phase 1 — Viewer + organizer:** pdf.js canvas + text layer, thumbnails, zoom, search; merge/split/reorder/rotate/delete via pdf-lib; open/save via Tauri dialog+fs. Page virtualization from day one (render current ±2 pages only — Android memory).
✅ Open a 100-page PDF, reorder pages, save; file reopens correctly in Edge.
**✅ COMPLETE (2026-07-05).** Design: reorder/rotate/delete are a virtual page mapping (`store.ts` PageState[]), materialized through pdf-lib only on save/extract/merge — instant organizer UX, one write path. Verified: automated Node suite over `core/pdf-ops.ts` (reorder/rotate/delete/merge/extract on 100 pages, incl. intrinsic-/Rotate composition), plus the in-app acceptance run — 100-page fixture opened, reordered/rotated/deleted, saved, reopened correctly in Edge. Test corpus lives in `fixtures/`.

**Phase 2 — Annotate:** `annotations.ts` writing real annotation dicts WITH appearance streams; overlay UI on the viewer.
✅ Highlight + sticky note made here are visible and editable in Adobe Reader.
Status 2026-07-05: built. `core/annotations.ts` writes /Highlight (QuadPoints + Multiply-blend Form-XObject AP) and /Text sticky notes (icon AP + linked /Popup), all with /T, /Contents, /NM, /M for editability; annotations ride the virtual page mapping and materialize on save/extract/merge. 26-check Node suite passed (dict structure, AP streams, popup linkage, reorder-following, pdf.js parse with hasAppearance=true). Pending to close: Adobe Reader visible+editable check (`fixtures/annotated-sample.pdf` + an in-app annotate/save run).

**Phase 3 — Fill & sign:** AcroForm detect/fill, signature pad → image/ink annot, flatten.
✅ A filled government-style form opens flattened in another reader.

**Phase 4 — OCR & convert:** tesseract.js worker pool (downscale to ~300 DPI grayscale first, page-at-a-time, progress + cancel, `eng` fast traineddata bundled), invisible text layer; images↔PDF; PDF→PNG.
✅ A scanned PDF becomes Ctrl-F-searchable.

**Phase 5 — Premium tier:** encrypt/decrypt, watermarks/headers/footers/page numbers, compress, compare (pixelmatch), metadata editor, raster redaction (stream-surgery redaction second, behind the text-gone assertion), limited text edit.
✅ Each feature has its own acceptance check; redaction verified by post-redaction text extraction.

**Phase 6 — Distribution:** Android camera-scan, memory hardening, keystore (`keytool -genkey ... -validity 10000` — **back it up; losing it breaks updates**), signed APK (`npx tauri android build --apk`, `apksigner verify`), NSIS installer polish, in-app update check against a static JSON (GitHub Releases: versionCode + download URL), `docs/DISTRIBUTION.md` with the colleague side-load walkthrough ("install unknown apps" prompt, same-signature updates).
✅ A colleague installs the APK from a shared link and later updates in place; Windows installer installs/uninstalls cleanly.

## Top risks & mitigations

1. **Android webview memory on large PDFs** → page virtualization, capped canvas scale, aggressive pdf.js document/worker destruction (known leak, pdf.js #20198), byte-heavy ops on the Rust side.
2. **Annotation interop** → always write appearance streams; fixture corpus; test in Adobe Reader/Edge/Firefox every phase.
3. **WASM/worker quirks in Tauri's custom scheme** → `WebAssembly.instantiate(arrayBuffer)` not `instantiateStreaming`; bundle all assets locally; CSP configured (done, Phase 0). ✅ Closed on Windows by release-mode spike.
4. **OCR speed on mid-range Android** → preprocessing + cancelable page-at-a-time + honest UI expectations.
5. **Redaction correctness (liability)** → raster-first; stream surgery only behind automated "target text is gone" verification.

## Verification doctrine

- Per-phase acceptance criteria above, each exercised end-to-end in the running app (`npx tauri dev`, then real builds).
- Cross-reader interop: every write path (annots, forms, encryption) opened in Adobe Reader + Edge before a phase closes.
- Android: run on a real device via `adb install` at every phase, not just at the end.
- Redaction: automated text-extraction assertion.

## Naming (permanent after first distributed APK)

Product: **Ian PDF Pro** · slug `ian-pdf-pro` · lib `ian_pdf_pro_lib` · identifier **`com.ianpdfpro.app`**
