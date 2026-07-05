import { memo, useEffect, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import { useApp } from "../../store";
import type { PageState } from "../../store";
import * as engine from "../../core/pdf-engine";

export function ThumbnailSidebar() {
  const pages = useApp((s) => s.pages);
  const docVersion = useApp((s) => s.docVersion);
  const currentPage = useApp((s) => s.currentPage);
  const selection = useApp((s) => s.selection);
  const selectPage = useApp((s) => s.selectPage);
  const movePage = useApp((s) => s.movePage);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <aside className="sidebar">
      {pages.map((p, i) => (
        <Thumb
          key={p.id}
          page={p}
          viewIndex={i}
          docVersion={docVersion}
          current={i === currentPage}
          selected={selection.includes(p.id)}
          dropTarget={dropAt === i && dragFrom !== null && dragFrom !== i}
          onClick={(e) => selectPage(p.id, e.ctrlKey || e.metaKey)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDragFrom(i);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dropAt !== i) setDropAt(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFrom !== null) movePage(dragFrom, i);
            endDrag();
          }}
          onDragEnd={endDrag}
        />
      ))}
    </aside>
  );
}

interface ThumbProps {
  page: PageState;
  viewIndex: number;
  docVersion: number;
  current: boolean;
  selected: boolean;
  dropTarget: boolean;
  onClick: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
}

const Thumb = memo(function Thumb({
  page,
  viewIndex,
  docVersion,
  current,
  selected,
  dropTarget,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(null);
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          engine
            .renderThumbnail(page.srcIndex, page.extraRotation)
            .then((u) => {
              if (live) setUrl(u);
            })
            .catch(() => {});
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [page.srcIndex, page.extraRotation, docVersion]);

  const cls = [
    "thumb",
    current ? "is-current" : "",
    selected ? "is-selected" : "",
    dropTarget ? "is-drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      className={cls}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      title={`Page ${viewIndex + 1} — click to jump, Ctrl+click to multi-select, drag to reorder`}
    >
      <div className="thumb-frame">
        {url ? (
          <img src={url} alt={`Page ${viewIndex + 1}`} draggable={false} />
        ) : (
          <div className="thumb-skeleton" />
        )}
      </div>
      <span className="thumb-num">{viewIndex + 1}</span>
    </div>
  );
});
