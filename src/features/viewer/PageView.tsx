import { memo, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useApp } from "../../store";
import type { PageState } from "../../store";
import * as engine from "../../core/pdf-engine";
import { highlightTextLayer } from "./highlight";
import { AnnotationOverlay } from "../annotate/AnnotationOverlay";

interface Props {
  page: PageState;
  viewIndex: number;
  top: number;
  width: number;
  height: number;
  zoom: number;
  docVersion: number;
  shouldRender: boolean;
  query: string | null;
}

export const PageView = memo(function PageView({
  page,
  viewIndex,
  top,
  width,
  height,
  zoom,
  docVersion,
  shouldRender,
  query,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const tool = useApp((s) => s.tool);
  const addNote = useApp((s) => s.addNote);

  const onPageClick = async (e: MouseEvent<HTMLDivElement>) => {
    if (tool !== "note" || !rendered) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const conv = await engine.getPageConverters(
      page.srcIndex,
      zoom,
      page.extraRotation
    );
    const [px, py] = conv.cssToPdf(e.clientX - rect.left, e.clientY - rect.top);
    const half = engine.NOTE_ICON_SIZE / 2;
    addNote(page.srcIndex, px - half, py - half);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    if (!shouldRender) {
      // leaving the render window: release canvas memory immediately
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas.removeAttribute("style");
      }
      text?.replaceChildren();
      setRendered(false);
      return;
    }
    if (!canvas || !text) return;
    let disposed = false;
    const job = engine.renderPageToCanvas(
      page.srcIndex,
      canvas,
      text,
      zoom,
      page.extraRotation
    );
    job.promise.then(() => {
      if (disposed) return;
      setRendered(true);
      if (queryRef.current) highlightTextLayer(text, queryRef.current);
    });
    return () => {
      disposed = true;
      job.cancel();
    };
  }, [shouldRender, zoom, page.srcIndex, page.extraRotation, docVersion]);

  useEffect(() => {
    if (rendered && textRef.current) {
      highlightTextLayer(textRef.current, query);
    }
  }, [query, rendered]);

  return (
    <div
      className={`page${tool === "note" ? " tool-note" : ""}`}
      style={{ top, width, height }}
      data-page={viewIndex + 1}
      onClick={(e) => void onPageClick(e)}
    >
      {!rendered && <div className="page-placeholder">{viewIndex + 1}</div>}
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textRef} />
      {shouldRender && (
        <AnnotationOverlay
          srcIndex={page.srcIndex}
          extraRotation={page.extraRotation}
          zoom={zoom}
        />
      )}
    </div>
  );
});
