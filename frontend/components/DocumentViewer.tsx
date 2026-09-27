"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Scan, SquareDashed } from "lucide-react";
import { BAND_COLOR, band } from "@/lib/format";
import { useReviewStore, type FocusTarget } from "@/lib/store";
import type { BBox } from "@/lib/types";

interface Props {
  imageUrl: string | null;
  boxes: FocusTarget[];
  /** Natural pixel size of the scan; boxes are in these coordinates. */
  naturalWidth?: number;
  naturalHeight?: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

export default function DocumentViewer({ imageUrl, boxes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const focused = useReviewStore((s) => s.focused);
  const hovered = useReviewStore((s) => s.hovered);
  const showOverlay = useReviewStore((s) => s.showOverlay);
  const toggleOverlay = useReviewStore((s) => s.toggleOverlay);

  const fit = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || !size.w || !size.h) return;
    const next = Math.min((box.width - 48) / size.w, (box.height - 48) / size.h);
    setScale(next);
    setOffset({ x: (box.width - size.w * next) / 2, y: (box.height - size.h * next) / 2 });
  }, [size]);

  useEffect(() => {
    if (size.w) fit();
  }, [size, fit]);

  /**
   * Reactive focus sync. When a field on the right is focused, centre its box
   * and zoom in enough to read it — but never zoom out from where the reviewer
   * already is, because yanking the view backwards mid-correction is
   * disorienting. Small boxes get more magnification than large ones.
   */
  useEffect(() => {
    if (!focused?.bbox) return;
    const container = containerRef.current?.getBoundingClientRect();
    if (!container || !size.w) return;

    const { xmin, xmax, ymin, ymax } = focused.bbox;
    const boxW = Math.max(xmax - xmin, 1);
    const boxH = Math.max(ymax - ymin, 1);

    const target = Math.min(
      MAX_SCALE,
      Math.max(scale, Math.min((container.width * 0.55) / boxW, (container.height * 0.45) / boxH)),
    );

    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;

    setScale(target);
    setOffset({
      x: container.width / 2 - cx * target,
      y: container.height / 2 - cy * target,
    });
  }, [focused, size.w]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return;
    const px = (clientX ?? container.left + container.width / 2) - container.left;
    const py = (clientY ?? container.top + container.height / 2) - container.top;

    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
      // Keep the point under the cursor stationary while zooming.
      setOffset((o) => ({
        x: px - ((px - o.x) / prev) * next,
        y: py - ((py - o.y) / prev) * next,
      }));
      return next;
    });
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 2) return;
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    setDragging(true);
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (event.clientX - dragStart.current.x),
      y: dragStart.current.oy + (event.clientY - dragStart.current.y),
    });
  };

  const stopDrag = () => setDragging(false);

  const visible = useMemo(() => boxes.filter((b) => b.bbox), [boxes]);

  return (
    <div className="relative flex h-full flex-col bg-well">
      <div
        ref={containerRef}
        className="scan-canvas relative flex-1 overflow-hidden"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        {!imageUrl && (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-ink-muted">
            <div>
              <Scan className="mx-auto mb-3 h-7 w-7 opacity-50" />
              The source scan could not be loaded from the document store.
              <br />
              Field values below are still editable.
            </div>
          </div>
        )}

        {imageUrl && <Watermark />}

        {imageUrl && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Source land record scan"
              draggable={false}
              onLoad={(event) => {
                const el = event.currentTarget;
                setSize({ w: el.naturalWidth, h: el.naturalHeight });
              }}
              className="block max-w-none select-none"
            />

            {showOverlay && size.w > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={size.w}
                height={size.h}
                viewBox={`0 0 ${size.w} ${size.h}`}
              >
                {visible.map((box) => (
                  <BoxOutline
                    key={box.key}
                    target={box}
                    active={focused?.key === box.key}
                    hovered={hovered === box.key}
                    scale={scale}
                  />
                ))}
              </svg>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded bg-black/55 p-1 backdrop-blur">
            <IconButton label="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
              <Minus className="h-4 w-4" />
            </IconButton>
            <span className="w-14 text-center text-2xs tabular text-white/80">
              {Math.round(scale * 100)}%
            </span>
            <IconButton label="Zoom in" onClick={() => zoomAt(1.25)}>
              <Plus className="h-4 w-4" />
            </IconButton>
            <div className="mx-1 h-4 w-px bg-white/20" />
            <IconButton label="Fit page" onClick={fit}>
              <Maximize2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={showOverlay ? "Hide detected fields" : "Show detected fields"}
              onClick={toggleOverlay}
              pressed={showOverlay}
            >
              <SquareDashed className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="pointer-events-none rounded bg-black/55 px-2.5 py-1.5 text-2xs text-white/70 backdrop-blur">
            {visible.length} fields located · drag to pan · ctrl-scroll to zoom
          </div>
        </div>
      </div>
    </div>
  );
}

/** Diagonal, non-interactive "official record" watermark fixed to the viewport
 *  (it does not pan or zoom with the scan), as on a physical revenue record. */
function Watermark() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full select-none"
      aria-hidden
    >
      <defs>
        <pattern
          id="ror-watermark"
          width="620"
          height="200"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-30)"
        >
          <text
            x="0"
            y="100"
            fill="#ffffff"
            fillOpacity="0.045"
            fontSize="20"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="3"
          >
            GOVERNMENT OF INDIA · OFFICIAL REVENUE RECORD · CONFIDENTIAL REVIEW
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ror-watermark)" />
    </svg>
  );
}

function BoxOutline({
  target,
  active,
  hovered,
  scale,
}: {
  target: FocusTarget;
  active: boolean;
  hovered: boolean;
  scale: number;
}) {
  const b = target.bbox as BBox;
  const color = BAND_COLOR[band(target.confidence)];
  // Stroke is divided by scale so the outline keeps the same on-screen weight
  // at every zoom level; otherwise it swallows the glyphs it is marking.
  const weight = (active ? 3 : hovered ? 2.4 : 1.6) / scale;

  return (
    <g>
      <rect
        x={b.xmin}
        y={b.ymin}
        width={Math.max(b.xmax - b.xmin, 2)}
        height={Math.max(b.ymax - b.ymin, 2)}
        fill={active || hovered ? color : "none"}
        fillOpacity={active ? 0.16 : hovered ? 0.09 : 0}
        stroke={color}
        strokeWidth={weight}
        rx={2 / scale}
      />
      {active && target.label && (
        <text
          x={b.xmin}
          y={b.ymin - 6 / scale}
          fill={color}
          fontSize={13 / scale}
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight={600}
        >
          {target.label}
        </text>
      )}
    </g>
  );
}

function IconButton({
  children,
  label,
  onClick,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded p-1.5 text-white/85 transition-colors hover:bg-white/15 ${
        pressed ? "bg-white/15" : ""
      }`}
    >
      {children}
    </button>
  );
}
