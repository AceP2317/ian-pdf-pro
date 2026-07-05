import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";
import { Viewer } from "./features/viewer/Viewer";
import { ThumbnailSidebar } from "./features/organizer/ThumbnailSidebar";
import "./App.css";

const ZOOM_STEP = 1.25;

function App() {
  const fileName = useApp((s) => s.fileName);
  const dirty = useApp((s) => s.dirty);
  const busy = useApp((s) => s.busy);
  const error = useApp((s) => s.error);
  const pages = useApp((s) => s.pages);
  const dims = useApp((s) => s.dims);
  const currentPage = useApp((s) => s.currentPage);
  const zoom = useApp((s) => s.zoom);
  const search = useApp((s) => s.search);
  const openFile = useApp((s) => s.openFile);
  const save = useApp((s) => s.save);
  const saveAs = useApp((s) => s.saveAs);
  const mergeFiles = useApp((s) => s.mergeFiles);
  const rotateSelection = useApp((s) => s.rotateSelection);
  const deleteSelection = useApp((s) => s.deleteSelection);
  const setZoom = useApp((s) => s.setZoom);
  const runSearch = useApp((s) => s.runSearch);
  const gotoMatch = useApp((s) => s.gotoMatch);
  const clearSearch = useApp((s) => s.clearSearch);
  const clearError = useApp((s) => s.clearError);

  const [extractOpen, setExtractOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hasDoc = pages.length > 0;

  const fitWidth = () => {
    const el = document.querySelector<HTMLElement>(".viewer");
    if (!el || pages.length === 0) return;
    const widest = Math.max(
      ...pages.map((p) => {
        const d = dims[p.srcIndex];
        return (d.rotate + p.extraRotation) % 180 !== 0 ? d.height : d.width;
      })
    );
    setZoom((el.clientWidth - 72) / widest);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "o") {
        e.preventDefault();
        void openFile();
      } else if (k === "s") {
        e.preventDefault();
        void (e.shiftKey ? saveAs() : save());
      } else if (k === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        setZoom(useApp.getState().zoom * ZOOM_STEP);
      } else if (k === "-") {
        e.preventDefault();
        setZoom(useApp.getState().zoom / ZOOM_STEP);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFile, save, saveAs, setZoom]);

  const submitSearch = () => {
    if (searchText.trim()) {
      void runSearch(searchText);
    } else {
      clearSearch();
    }
  };

  const totalHits = search?.matches.reduce((n, m) => n + m.count, 0) ?? 0;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-group">
          <button onClick={() => void openFile()} title="Open a PDF (Ctrl+O)">
            Open
          </button>
          <button
            onClick={() => void save()}
            disabled={!hasDoc}
            title="Save (Ctrl+S)"
          >
            Save{dirty ? " •" : ""}
          </button>
          <button
            onClick={() => void saveAs()}
            disabled={!hasDoc}
            title="Save a copy (Ctrl+Shift+S)"
          >
            Save As
          </button>
        </div>
        <div className="toolbar-group">
          <button
            onClick={() => void mergeFiles()}
            title="Append pages from other PDFs"
          >
            Merge
          </button>
          <button
            onClick={() => setExtractOpen((v) => !v)}
            disabled={!hasDoc}
            title="Save a page range as a new PDF"
          >
            Extract
          </button>
        </div>
        <div className="toolbar-group">
          <button
            onClick={() => rotateSelection(-90)}
            disabled={!hasDoc}
            title="Rotate selected pages counter-clockwise"
          >
            ⟲
          </button>
          <button
            onClick={() => rotateSelection(90)}
            disabled={!hasDoc}
            title="Rotate selected pages clockwise"
          >
            ⟳
          </button>
          <button
            onClick={() => deleteSelection()}
            disabled={!hasDoc}
            title="Delete selected pages"
          >
            Delete
          </button>
        </div>
        <div className="toolbar-group">
          <button
            onClick={() => setZoom(zoom / ZOOM_STEP)}
            disabled={!hasDoc}
            title="Zoom out (Ctrl+-)"
          >
            −
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(zoom * ZOOM_STEP)}
            disabled={!hasDoc}
            title="Zoom in (Ctrl+=)"
          >
            +
          </button>
          <button onClick={fitWidth} disabled={!hasDoc} title="Fit page width">
            Fit
          </button>
        </div>
        <div className="toolbar-spacer">
          {hasDoc && (
            <span className="doc-status">
              {fileName ?? "untitled.pdf"}
              {dirty ? " (unsaved)" : ""} · {currentPage + 1} / {pages.length}
            </span>
          )}
        </div>
        <div className="toolbar-group search-group">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search (Ctrl+F)"
            value={searchText}
            disabled={!hasDoc}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (search && search.query === searchText.trim()) {
                  gotoMatch(e.shiftKey ? -1 : 1);
                } else {
                  submitSearch();
                }
              } else if (e.key === "Escape") {
                setSearchText("");
                clearSearch();
              }
            }}
          />
          {search && (
            <>
              <span className="search-count">
                {search.matches.length > 0
                  ? `${totalHits} hit${totalHits === 1 ? "" : "s"} on ${search.matches.length} page${search.matches.length === 1 ? "" : "s"}`
                  : "no hits"}
              </span>
              <button
                onClick={() => gotoMatch(-1)}
                disabled={search.matches.length === 0}
                title="Previous matching page (Shift+Enter)"
              >
                ▲
              </button>
              <button
                onClick={() => gotoMatch(1)}
                disabled={search.matches.length === 0}
                title="Next matching page (Enter)"
              >
                ▼
              </button>
              <button
                onClick={() => {
                  setSearchText("");
                  clearSearch();
                }}
                title="Clear search"
              >
                ×
              </button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="banner">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      {extractOpen && hasDoc && (
        <ExtractBar total={pages.length} onClose={() => setExtractOpen(false)} />
      )}

      <div className="body">
        {hasDoc && <ThumbnailSidebar />}
        {hasDoc ? (
          <Viewer />
        ) : (
          <div className="empty">
            <div className="empty-card">
              <h1>Ian PDF Pro</h1>
              <p>Open a PDF to view, reorder, rotate, merge, and split pages.</p>
              <button className="primary" onClick={() => void openFile()}>
                Open PDF… (Ctrl+O)
              </button>
              <button onClick={() => void mergeFiles()}>
                Combine multiple PDFs…
              </button>
            </div>
          </div>
        )}
      </div>

      {busy && (
        <div className="busy-overlay">
          <div className="spinner" />
          <span>{busy}</span>
        </div>
      )}
    </div>
  );
}

function ExtractBar({
  total,
  onClose,
}: {
  total: number;
  onClose: () => void;
}) {
  const extractPages = useApp((s) => s.extractPages);
  const [text, setText] = useState("");

  const submit = async () => {
    await extractPages(text);
    if (!useApp.getState().error) onClose();
  };

  return (
    <div className="extract-bar">
      <label>
        Extract pages (e.g. 1-3, 7 of {total}):
        <input
          autoFocus
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onClose();
          }}
        />
      </label>
      <button onClick={() => void submit()} disabled={!text.trim()}>
        Save as…
      </button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
}

export default App;
