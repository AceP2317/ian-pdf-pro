import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "../../store";
import { PageView } from "./PageView";

const GAP = 20;
const PAD = 24;
const OVERSCAN = 2; // render current ± this many pages

export function Viewer() {
  const pages = useApp((s) => s.pages);
  const dims = useApp((s) => s.dims);
  const zoom = useApp((s) => s.zoom);
  const docVersion = useApp((s) => s.docVersion);
  const scrollRequest = useApp((s) => s.scrollRequest);
  const setCurrentPage = useApp((s) => s.setCurrentPage);
  const query = useApp((s) => s.search?.query ?? null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([0, OVERSCAN]);
  const fractionRef = useRef(0);
  const tickingRef = useRef(false);

  const layouts = useMemo(() => {
    let offset = PAD;
    return pages.map((p) => {
      const d = dims[p.srcIndex];
      const swap = (d.rotate + p.extraRotation) % 180 !== 0;
      const w = Math.floor((swap ? d.height : d.width) * zoom);
      const h = Math.floor((swap ? d.width : d.height) * zoom);
      const top = offset;
      offset += h + GAP;
      return { top, w, h };
    });
  }, [pages, dims, zoom]);

  const totalHeight =
    layouts.length > 0
      ? layouts[layouts.length - 1].top + layouts[layouts.length - 1].h + PAD
      : 0;

  const recompute = useCallback(() => {
    const el = containerRef.current;
    if (!el || layouts.length === 0) return;
    const topEdge = el.scrollTop;
    const bottomEdge = topEdge + el.clientHeight;
    let first = 0;
    while (
      first < layouts.length - 1 &&
      layouts[first].top + layouts[first].h < topEdge
    ) {
      first++;
    }
    let last = first;
    while (last < layouts.length - 1 && layouts[last + 1].top < bottomEdge) {
      last++;
    }
    setRange((prev) =>
      prev[0] === first - OVERSCAN && prev[1] === last + OVERSCAN
        ? prev
        : [first - OVERSCAN, last + OVERSCAN]
    );
    const center = topEdge + el.clientHeight / 2;
    let current = first;
    for (let i = first; i <= last; i++) {
      if (layouts[i].top <= center) current = i;
    }
    setCurrentPage(current);
    const denom = el.scrollHeight - el.clientHeight;
    fractionRef.current = denom > 0 ? el.scrollTop / denom : 0;
  }, [layouts, setCurrentPage]);

  const onScroll = () => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      tickingRef.current = false;
      recompute();
    });
  };

  // zoom changed: hold the reader's place by scroll fraction
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const denom = el.scrollHeight - el.clientHeight;
    el.scrollTop = fractionRef.current * Math.max(0, denom);
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (!scrollRequest) return;
    const el = containerRef.current;
    const layout = layouts[scrollRequest.page];
    if (el && layout) {
      el.scrollTo({ top: Math.max(0, layout.top - PAD) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest?.nonce]);

  useEffect(() => {
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recompute]);

  return (
    <div className="viewer" ref={containerRef} onScroll={onScroll}>
      <div className="viewer-canvas" style={{ height: totalHeight }}>
        {pages.map((p, i) => (
          <PageView
            key={p.id}
            page={p}
            viewIndex={i}
            top={layouts[i].top}
            width={layouts[i].w}
            height={layouts[i].h}
            zoom={zoom}
            docVersion={docVersion}
            shouldRender={i >= range[0] && i <= range[1]}
            query={query}
          />
        ))}
      </div>
    </div>
  );
}
