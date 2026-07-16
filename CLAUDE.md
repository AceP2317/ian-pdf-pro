# Ian PDF Pro

Tauri v2 desktop (Windows) + Android APK PDF suite. React 19 + TypeScript + Vite frontend; Rust shell in `src-tauri/`. Build plan and phase gates: `docs/BUILD_PLAN.md`.

## Environment (Windows 11)

Fresh shells do NOT have the toolchain on PATH — set these at the start of any build command:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-17.0.19+10"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.1.12297006"
```

(User-level env vars are set in the registry, so NEW terminals get them; long-lived tool shells may not.)

- Rust stable MSVC (rustup, per-user) + Android targets (aarch64/armv7/i686/x86_64-linux-android)
- JDK: portable Microsoft OpenJDK 17.0.19 at `%USERPROFILE%\.jdks\`
- Android SDK: `%LOCALAPPDATA%\Android\Sdk` (platforms 34+35, build-tools 34/35, NDK 27.1.12297006)
- VS Build Tools 2026 with C++ workload (machine-wide, preexisting)
- Node 24

## Commands

- Desktop dev: `npx tauri dev`
- Frontend-only check: `npm run build` (tsc + vite)
- Android APK: `npx tauri android build --apk --target aarch64` (all-arch: drop `--target`)
- Android project lives in `src-tauri/gen/android/` (generated from tauri.conf.json; to change identifier/name, delete and re-run `npx tauri android init` — never hand-edit the baked-in identifier)

## Naming (settled 2026-07-05 — do not change after first distributed APK)

- Product/display name: **Ian PDF Pro** (window title, Android label, installer)
- Slugs: npm/crate `ian-pdf-pro`, Rust lib `ian_pdf_pro_lib`
- App identifier: **`com.ianpdfpro.app`** — permanent once a colleague installs an APK; changing it breaks in-place updates.

## Conventions & constraints

- **Licensing: permissive only** (MIT/Apache/BSD/ISC). This app is distributed to colleagues — never add AGPL (PyMuPDF, Ghostscript) or commercial SDKs. Current core: `pdfjs-dist` (Apache-2.0), `@cantoo/pdf-lib` (MIT fork of pdf-lib, has encryption), `tesseract.js` planned (Apache-2.0), `@neslinesli93/qpdf-wasm` planned (Apache-2.0).
- pdf.js v6: `destroy()` lives on the loading task (`getDocument(...)`), not the document proxy.
- WASM must load via `WebAssembly.instantiate(arrayBuffer)` — NOT `instantiateStreaming` (MIME type under Tauri's custom scheme). All workers/WASM/traineddata bundled locally, never CDN.
- CSP is set in `src-tauri/tauri.conf.json` (`wasm-unsafe-eval`, blob: workers). Don't null it.
- Page rendering must stay virtualized (current ±2 pages) — Android WebView memory is the #1 risk. Destroy pdf.js loading tasks aggressively.
- Every PDF write path (annotations, forms, encryption) must be interop-checked in Adobe Reader + Edge before its phase closes.
- Repo folder is space-free (`Ian-PDF-Pro`; renamed 2026-07-05 from an old spaced folder name — the old path is dead, never reference it).

## Status

Phases 0–1 complete (Phase 1 accepted 2026-07-05: 100-page reorder/save reopened correctly in Edge); spike scaffolding removed (lives in git history at the Phase-0 baseline commit). Architecture: `src/core/pdf-engine.ts` is the facade (only module that imports pdfjs-dist); page reorder/rotate/delete are a virtual mapping in `src/store.ts`, materialized via `src/core/pdf-ops.ts` on save/extract/merge. Test corpus in `fixtures/`. Phase 2 (annotations) built 2026-07-05 — `core/annotations.ts` writes highlight/sticky-note dicts with appearance streams; acceptance pending: Adobe Reader visible+editable check. Remaining loose end: on-device Android spike (needs user's phone; signed test APK in `dist-test/`).
