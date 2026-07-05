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
- Project path contains spaces — quote paths in commands. If Android tooling ever chokes on the space, junction a space-free path instead of moving the repo.

## Status

Phase 0 (toolchain + scaffold + spike) complete; renamed from the interim working name 2026-07-05. `src/spike.ts` + spike UI in `App.tsx` are Phase-0 scaffolding, replaced in Phase 1 by the real viewer. Remaining Phase-0 loose end: on-device Android spike (needs user's phone; signed test APK in `dist-test/`).
