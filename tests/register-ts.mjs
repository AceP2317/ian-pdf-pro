// Node's ESM resolver requires an explicit file extension; Vite's does not, and
// src/core/pdf-ops.ts imports "./annotations". That one difference is the ONLY thing
// standing between these modules and plain Node — neither pdf-ops.ts nor annotations.ts
// touches window, document, Worker, or any Tauri API. This hook adds the extension for
// RELATIVE specifiers only, so bare package names ("@cantoo/pdf-lib") resolve normally.
//
// WHY A HOOK RATHER THAN EDITING THE IMPORTS. Changing src/core/pdf-ops.ts to
// import "./annotations.ts" also works — tsconfig already sets allowImportingTsExtensions
// and Vite handles it — and it is two lines instead of these fourteen. It loses because the
// seam would then live in SHIPPING code and would have to be remembered for every new file
// in src/core/ forever, with nothing enforcing it. The hook is a mechanism; the extension
// convention would be a checklist, and a checklist is the thing that gets missed.
//
// ponytail: test files are type-STRIPPED by Node, never type-CHECKED, so a wrong type in a
// test is invisible until it throws at runtime. tests/ is deliberately outside tsconfig's
// "include": pulling it in requires @types/node, which is not installed, and npm run build
// would start failing on node:test and node:fs imports.
// Upgrade path: add @types/node and a tsconfig.test.json extending the base with
// "include": ["tests"], then add `tsc -p tsconfig.test.json --noEmit` to npm test.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(spec)) {
      const base = new URL(spec, ctx.parentURL).href;
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(new URL(base + ext)))) return next(base + ext, ctx);
      }
    }
    return next(spec, ctx);
  },
});
