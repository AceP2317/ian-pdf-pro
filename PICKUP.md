# ▶▶ NEXT SESSION — DO FIRST

Live worklist for `Ian-PDF-Pro`. **Replaced whole at each wrap — never appended to.**
Superseded content moves to `docs/session-log.md` (which does not exist yet — create it at the
first wrap that has narrative to move).

First written 2026-08-08. Until then this repo had **no durable worklist at all**: its real
state lived as prose inside `CLAUDE.md`'s Status paragraph and `docs/BUILD_PLAN.md`'s phase
gates, and reached the next session only if the operator retyped it.

## Read order

1. **This file** — the live worklist.
2. **`CLAUDE.md`** — the durable contract. The PATH block and the ten constraints are the parts
   that bite; four of them are things a session gets wrong by default.
3. **`docs/BUILD_PLAN.md`** — scope, the feature→library→licence table, seven phases each with a
   written acceptance gate, and five ranked risks.

## State

**Phases 0-2 built. Phase 1 accepted; Phase 2 is NOT.** Five commits, clean tree, in sync with
`AceP2317/ian-pdf-pro`. No CI — there is no `.github/` at all, so nothing checks anything unless
you run it.

**Verified 2026-08-08: `npm run build` exits 0** (`tsc` clean, 340 modules, Vite build succeeds).
That had never been demonstrated, so treat it as the current baseline rather than a claim.

---

## 1. THE FINDING THAT OUTRANKS THE FEATURE WORK — two suites are asserted and do not exist

`docs/BUILD_PLAN.md` records Phase 1 as verified by *"an automated Node suite over
`core/pdf-ops.ts`"* and Phase 2 by *"a 26-check Node suite"*; commit `529bc62` repeats the
26-check claim.

**Neither suite is in the repo.** There is no `test` script in `package.json`, no test runner,
and no test file anywhere. They were run as throwaway scripts and never committed.

So two phases are recorded as verified by evidence nobody can re-run. That is worse than having
no tests, because the document says the work is checked. **A stale fact can be diffed against
reality; a deleted proof cannot.** Filed as `L-010` in `~/.claude/LEDGER.md`.

Pick one, and say which in the wrap:

- **Rewrite the suites and commit them.** The claims name exactly what they covered
  (reorder/rotate/delete/merge/extract over 100 pages including intrinsic-`/Rotate`
  composition; dict structure, AP streams, popup linkage, reorder-following, pdf.js parse with
  `hasAppearance=true`). That is a specification, so this is recoverable work rather than
  invention.
- **Or downgrade the claims** to "manually checked on <date>" and accept the phases as
  unverified in writing.

Doing neither leaves the repo asserting something untrue.

## 2. OPERATOR ACTIONS — nothing here is agent-executable

1. **Phase 2 acceptance: the Adobe Reader visible+editable check.** Open
   `fixtures/annotated-sample.pdf` in Adobe Reader, confirm the highlight and sticky note are
   both visible AND editable, then do one in-app annotate/save round trip. `CLAUDE.md` makes
   Reader+Edge interop a gate for every PDF write path, so Phase 2 cannot close without it.
2. **The on-device Android spike.** Needs a physical phone. The signed test APK is already
   built at `dist-test/ian-pdf-pro-test.apk` (12 MB). `dist-test/` is gitignored, so it is
   local-only — if it is missing, rebuild with
   `npx tauri android build --apk --target aarch64`.
3. **Decide on the filesystem scope grant.** `src-tauri/capabilities/default.json` grants
   `fs:scope` with `{"path": "**"}` — a whole-filesystem wildcard — alongside the narrower
   `$HOME/**` and `$TEMP/**` entries. For an app being handed to colleagues that is a wide
   grant, and no document mentions it. **Flagged, not changed:** narrowing it is a behaviour
   decision, not a typo fix, and it could break file opening.

## 3. Unstarted, and already specified

`BUILD_PLAN.md` phases 3-6, each with its acceptance gate written: **Phase 3** fill & sign ·
**Phase 4** OCR & convert · **Phase 5** the premium tier (encrypt, watermark, compress, compare,
metadata, redaction) · **Phase 6** distribution. This is a written forward plan, not a backlog to
invent — work it in order.

`docs/DISTRIBUTION.md` and `src/workers/` are referenced by `BUILD_PLAN.md` and do not exist
yet. Both are Phase 4-6 deliverables, so that is expected, not broken.

## Watch / known ceilings

- **The main bundle is 1,253 kB** (450 kB gzipped) and Vite warns on it. That is not cosmetic
  here: `BUILD_PLAN.md` ranks **Android WebView memory as the top risk**, and page rendering is
  deliberately virtualised to ±2 pages for the same reason. Code-splitting is the named fix.
- **`src-tauri/gen/android/` is generated AND committed** (50+ files including
  `gradle-wrapper.jar`). So a hand edit there looks like an ordinary diff in review.
  `CLAUDE.md`: never hand-edit the baked-in identifier — delete the tree and re-run
  `npx tauri android init`.
- **`com.ianpdfpro.app` is permanent** once a colleague installs an APK. Changing it breaks
  in-place updates for them. Slugs `ian-pdf-pro` (npm/crate) and `ian_pdf_pro_lib` (Rust lib).
- **A fresh shell cannot build.** Four variables must be set first — `$env:Path`, `JAVA_HOME`,
  `ANDROID_HOME`, `NDK_HOME`. The block is in `CLAUDE.md`; all four target paths were confirmed
  present on disk 2026-08-08.
- **Four constraints a session gets wrong by default**, all in `CLAUDE.md`: pdf.js v6 puts
  `destroy()` on the loading task from `getDocument(...)`, not the document proxy; WASM must load
  via `WebAssembly.instantiate(arrayBuffer)` and never `instantiateStreaming` (MIME type under
  Tauri's custom scheme); the CSP in `src-tauri/tauri.conf.json` must not be nulled; rendering
  stays virtualised.
- **One in-code deferral, `ponytail:`-shaped without the token** —
  `src/features/viewer/highlight.ts` notes that search matches spanning two text-layer spans are
  missed, and names a real find controller as the fix.
- **`dist-test/asobe-spike-test.apk.idsig`** is an orphaned signature with no matching APK, left
  from the interim working name. Gitignored, harmless, delete when convenient.

## Not open — settled, don't relitigate

- **Deliberate scope cuts** (`BUILD_PLAN.md`): full reflow text editing, Office→PDF in v1, PKI
  signatures, and guaranteed PDF/A conformance are all OUT. Do not read them as gaps.
- **Permissive licences only** — MIT/Apache/BSD/ISC. **AGPL is banned**, which rules out
  PyMuPDF and Ghostscript. The repo exists to be handed to colleagues, so this is a
  distribution constraint, not a preference.
- **Port 1420 is the Tauri dev contract**, pinned with `strictPort: true` in `vite.config.ts`
  and matched by `devUrl` in `tauri.conf.json`. Registered in `~/dev/PORTS.md`.
- **The folder is space-free on purpose.** Renamed from a spaced name on 2026-07-05 because
  spaces tear paths in half in shell pipelines. The old path is dead — never reference it.
