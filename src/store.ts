import { create } from "zustand";
import * as engine from "./core/pdf-engine";
import type { PageDim, SearchMatch, Rotation } from "./core/pdf-engine";
import { pickPdf, pickPdfs, pickSavePath } from "./platform/dialogs";
import { readFileBytes, writeFileBytes, baseName } from "./platform/fs";

export interface PageState {
  id: number; // stable across reorder — React keys and selection
  srcIndex: number;
  extraRotation: Rotation;
}

export interface SearchState {
  query: string;
  matches: SearchMatch[]; // in current visual order
  active: number; // index into matches
}

let nextPageId = 1;

function identityPageStates(numPages: number): PageState[] {
  return Array.from({ length: numPages }, (_, i) => ({
    id: nextPageId++,
    srcIndex: i,
    extraRotation: 0 as Rotation,
  }));
}

interface AppState {
  filePath: string | null;
  fileName: string | null;
  srcBytes: Uint8Array | null;
  pages: PageState[];
  dims: PageDim[]; // indexed by srcIndex
  docVersion: number; // bumps on every engine load
  dirty: boolean;
  currentPage: number; // view index, 0-based
  zoom: number;
  selection: number[]; // page ids
  search: SearchState | null;
  scrollRequest: { page: number; nonce: number } | null;
  busy: string | null;
  error: string | null;

  openFile(): Promise<void>;
  openPath(path: string): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  mergeFiles(): Promise<void>;
  extractPages(rangeText: string): Promise<void>;
  movePage(from: number, to: number): void;
  rotateSelection(dir: 90 | -90): void;
  deleteSelection(): void;
  selectPage(id: number, additive: boolean): void;
  setCurrentPage(view: number): void;
  setZoom(zoom: number): void;
  runSearch(query: string): Promise<void>;
  gotoMatch(delta: 1 | -1): void;
  clearSearch(): void;
  clearError(): void;
}

const clampZoom = (z: number) => Math.min(4, Math.max(0.25, z));

export const useApp = create<AppState>()((set, get) => {
  // ids of pages the next mutation applies to: selection, else current page
  const targetIds = (): number[] => {
    const { selection, pages, currentPage } = get();
    if (selection.length > 0) return selection;
    const cur = pages[currentPage];
    return cur ? [cur.id] : [];
  };

  const loadIntoViewer = async (
    bytes: Uint8Array,
    filePath: string | null,
    dirty: boolean
  ) => {
    const { dims } = await engine.loadDocument(bytes);
    set((s) => ({
      srcBytes: bytes,
      filePath,
      fileName: filePath ? baseName(filePath) : (get().fileName ?? "untitled.pdf"),
      pages: identityPageStates(dims.length),
      dims,
      docVersion: s.docVersion + 1,
      dirty,
      currentPage: 0,
      selection: [],
      search: null,
      scrollRequest: { page: 0, nonce: s.docVersion + 1 },
    }));
  };

  const withBusy = async (label: string, fn: () => Promise<void>) => {
    if (get().busy) return;
    set({ busy: label, error: null });
    try {
      await fn();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ busy: null });
    }
  };

  return {
    filePath: null,
    fileName: null,
    srcBytes: null,
    pages: [],
    dims: [],
    docVersion: 0,
    dirty: false,
    currentPage: 0,
    zoom: 1,
    selection: [],
    search: null,
    scrollRequest: null,
    busy: null,
    error: null,

    openFile: () =>
      withBusy("Opening…", async () => {
        const path = await pickPdf();
        if (!path) return;
        await loadIntoViewer(await readFileBytes(path), path, false);
      }),

    openPath: (path) =>
      withBusy("Opening…", async () => {
        await loadIntoViewer(await readFileBytes(path), path, false);
      }),

    save: () =>
      withBusy("Saving…", async () => {
        const { srcBytes, pages, filePath, fileName } = get();
        if (!srcBytes) return;
        let path = filePath;
        if (!path) {
          path = await pickSavePath(fileName ?? "untitled.pdf");
          if (!path) return;
        }
        const bytes = await engine.materialize(srcBytes, pages);
        await writeFileBytes(path, bytes);
        set({ filePath: path, fileName: baseName(path), dirty: false });
      }),

    saveAs: () =>
      withBusy("Saving…", async () => {
        const { srcBytes, pages, fileName } = get();
        if (!srcBytes) return;
        const path = await pickSavePath(fileName ?? "untitled.pdf");
        if (!path) return;
        const bytes = await engine.materialize(srcBytes, pages);
        await writeFileBytes(path, bytes);
        set({ filePath: path, fileName: baseName(path), dirty: false });
      }),

    mergeFiles: () =>
      withBusy("Merging…", async () => {
        const paths = await pickPdfs();
        if (paths.length === 0) return;
        const incoming: Uint8Array[] = [];
        for (const p of paths) incoming.push(await readFileBytes(p));
        const { srcBytes, pages, filePath } = get();
        if (!srcBytes) {
          // nothing open: first picked file becomes the document
          const base = incoming.shift()!;
          const merged =
            incoming.length > 0 ? await engine.appendPdfs(base, incoming) : base;
          await loadIntoViewer(merged, paths.length === 1 ? paths[0] : null, paths.length > 1);
          return;
        }
        const current = await engine.materialize(srcBytes, pages);
        const merged = await engine.appendPdfs(current, incoming);
        await loadIntoViewer(merged, filePath, true);
      }),

    extractPages: (rangeText) =>
      withBusy("Extracting…", async () => {
        const { srcBytes, pages, fileName } = get();
        if (!srcBytes) return;
        const viewIndices = engine.parsePageRanges(rangeText, pages.length);
        const entries = viewIndices.map((v) => pages[v]);
        const stem = (fileName ?? "untitled.pdf").replace(/\.pdf$/i, "");
        const path = await pickSavePath(`${stem}-pages.pdf`);
        if (!path) return;
        const bytes = await engine.materialize(srcBytes, entries);
        await writeFileBytes(path, bytes);
      }),

    movePage: (from, to) => {
      const pages = [...get().pages];
      if (from === to || from < 0 || from >= pages.length || to < 0 || to >= pages.length) {
        return;
      }
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      set({ pages, dirty: true, search: null });
    },

    rotateSelection: (dir) => {
      const ids = new Set(targetIds());
      if (ids.size === 0) return;
      set((s) => ({
        pages: s.pages.map((p) =>
          ids.has(p.id)
            ? {
                ...p,
                extraRotation: (((p.extraRotation + dir) % 360) + 360) %
                  360 as Rotation,
              }
            : p
        ),
        dirty: true,
      }));
    },

    deleteSelection: () => {
      const ids = new Set(targetIds());
      if (ids.size === 0) return;
      const { pages } = get();
      const remaining = pages.filter((p) => !ids.has(p.id));
      if (remaining.length === 0) {
        set({ error: "A PDF must keep at least one page" });
        return;
      }
      set((s) => ({
        pages: remaining,
        selection: [],
        currentPage: Math.min(s.currentPage, remaining.length - 1),
        dirty: true,
        search: null,
      }));
    },

    selectPage: (id, additive) => {
      set((s) => {
        const view = s.pages.findIndex((p) => p.id === id);
        const selection = additive
          ? s.selection.includes(id)
            ? s.selection.filter((x) => x !== id)
            : [...s.selection, id]
          : [id];
        return {
          selection,
          ...(view >= 0 && !additive
            ? {
                currentPage: view,
                scrollRequest: { page: view, nonce: Date.now() },
              }
            : {}),
        };
      });
    },

    setCurrentPage: (view) => {
      const max = get().pages.length - 1;
      const clamped = Math.min(Math.max(0, view), Math.max(0, max));
      if (clamped !== get().currentPage) set({ currentPage: clamped });
    },

    setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

    runSearch: async (query) => {
      const { pages } = get();
      const trimmed = query.trim();
      if (!trimmed || pages.length === 0) {
        set({ search: null });
        return;
      }
      const matches = await engine.searchPages(
        trimmed,
        pages.map((p) => p.srcIndex)
      );
      set({ search: { query: trimmed, matches, active: 0 } });
      if (matches.length > 0) {
        const view = pages.findIndex((p) => p.srcIndex === matches[0].srcIndex);
        set({
          currentPage: view,
          scrollRequest: { page: view, nonce: Date.now() },
        });
      }
    },

    gotoMatch: (delta) => {
      const { search, pages } = get();
      if (!search || search.matches.length === 0) return;
      const active =
        (search.active + delta + search.matches.length) % search.matches.length;
      const view = pages.findIndex(
        (p) => p.srcIndex === search.matches[active].srcIndex
      );
      set({
        search: { ...search, active },
        currentPage: view,
        scrollRequest: { page: view, nonce: Date.now() },
      });
    },

    clearSearch: () => set({ search: null }),
    clearError: () => set({ error: null }),
  };
});
