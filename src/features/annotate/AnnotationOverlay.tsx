import { useEffect, useState } from "react";
import { useApp } from "../../store";
import * as engine from "../../core/pdf-engine";
import type { PageConverters, PdfRect } from "../../core/pdf-engine";

interface Props {
  srcIndex: number;
  extraRotation: number;
  zoom: number;
}

interface CssBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Maps a PDF-space rect to CSS via all four corners, so 90/180/270 display
// rotations land correctly.
function cssBox(conv: PageConverters, r: PdfRect): CssBox {
  const corners = [
    conv.pdfToCss(r.x, r.y),
    conv.pdfToCss(r.x + r.w, r.y),
    conv.pdfToCss(r.x, r.y + r.h),
    conv.pdfToCss(r.x + r.w, r.y + r.h),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

export function AnnotationOverlay({ srcIndex, extraRotation, zoom }: Props) {
  const annotations = useApp((s) => s.annotations);
  const noteEditor = useApp((s) => s.noteEditor);
  const openNoteEditor = useApp((s) => s.openNoteEditor);
  const setNoteText = useApp((s) => s.setNoteText);
  const deleteAnnotation = useApp((s) => s.deleteAnnotation);

  const mine = annotations.filter((a) => a.srcIndex === srcIndex);
  const [conv, setConv] = useState<PageConverters | null>(null);

  useEffect(() => {
    if (mine.length === 0) return;
    let live = true;
    engine
      .getPageConverters(srcIndex, zoom, extraRotation)
      .then((c) => {
        if (live) setConv(c);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcIndex, zoom, extraRotation, mine.length > 0]);

  if (!conv || mine.length === 0) return null;

  return (
    <div className="anno-layer">
      {mine.map((a) => {
        if (a.type === "highlight") {
          const first = cssBox(conv, a.quads[0]);
          return (
            <div key={a.id} className="anno-group">
              {a.quads.map((q, i) => {
                const b = cssBox(conv, q);
                return <div key={i} className="anno-hl" style={b} />;
              })}
              <button
                className="anno-del"
                style={{ left: first.left + first.width - 7, top: first.top - 7 }}
                title="Remove highlight"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteAnnotation(a.id);
                }}
              >
                ×
              </button>
            </div>
          );
        }
        const box = cssBox(conv, {
          x: a.x,
          y: a.y,
          w: engine.NOTE_ICON_SIZE,
          h: engine.NOTE_ICON_SIZE,
        });
        return (
          <div key={a.id} className="anno-group">
            <button
              className="anno-note"
              style={box}
              title={a.contents || "Sticky note — click to edit"}
              onClick={(e) => {
                e.stopPropagation();
                openNoteEditor(noteEditor === a.id ? null : a.id);
              }}
            >
              <svg viewBox="0 0 20 20" width="100%" height="100%">
                <path
                  d="M3.5 1 h13 a2.5 2.5 0 0 1 2.5 2.5 v8 a2.5 2.5 0 0 1-2.5 2.5 h-7 l-4.5 4.5 v-4.5 h-1.5 a2.5 2.5 0 0 1-2.5-2.5 v-8 a2.5 2.5 0 0 1 2.5-2.5 z"
                  fill="#ffd100"
                  stroke="#403308"
                  strokeWidth="1"
                />
                <line x1="4.5" y1="4.5" x2="15.5" y2="4.5" stroke="#403308" strokeWidth="0.9" />
                <line x1="4.5" y1="7.5" x2="15.5" y2="7.5" stroke="#403308" strokeWidth="0.9" />
                <line x1="4.5" y1="10.5" x2="11.5" y2="10.5" stroke="#403308" strokeWidth="0.9" />
              </svg>
            </button>
            {noteEditor === a.id && (
              <div
                className="note-editor"
                style={{ left: box.left + box.width + 8, top: box.top }}
                onClick={(e) => e.stopPropagation()}
              >
                <textarea
                  autoFocus
                  placeholder="Note text…"
                  value={a.contents}
                  onChange={(e) => setNoteText(a.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") openNoteEditor(null);
                  }}
                />
                <div className="note-editor-actions">
                  <button onClick={() => deleteAnnotation(a.id)}>Delete</button>
                  <button className="primary" onClick={() => openNoteEditor(null)}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
