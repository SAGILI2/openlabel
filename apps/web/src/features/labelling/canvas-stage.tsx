"use client";
import type Konva from "konva";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { needsCheck, normaliseBox, wordState, type Box, type EditableWord } from "./regions";

/** Zoom controls the workspace calls on the canvas, and where boxes are on screen. */
export interface CanvasHandle {
  zoom: (kind: "in" | "out" | "fit" | "focus") => void;
  /** Screen rectangle of a word's box (for the connector line), or null when off-screen. */
  boxOnScreen: (id: string) => DOMRect | null;
}

interface Props {
  imageUrl: string;
  words: EditableWord[];
  selectedId: string | null;
  /** Words in the selected word's line, shaded so the line reads as one. */
  lineIds: ReadonlySet<string>;
  /** Label shown above the selected box, e.g. "Line 7 · 2/2". */
  selectedLabel: string | null;
  onSelect: (id: string | null) => void;
  onChangeBox: (id: string, box: Box) => void;
  onDraw: (box: Box) => void;
  /** Right-click on a box: the box is selected and the menu opens at the pointer. */
  onBoxMenu?: (id: string, clientX: number, clientY: number) => void;
  /** When off, only the selected box is drawn, so the page itself is easy to read. */
  showBoxes?: boolean;
  /** Called after every pan, zoom or box change, so overlays (the connector) can follow. */
  onViewChange?: () => void;
  handle?: Ref<CanvasHandle> | undefined;
}

const INK = "#6f95f0";
const WARN = "#e8a400";
const DRAWN = "#c084fc";
const EDITED = "#f59e0b";
const DONE = "#22c55e";

function useImage(url: string): HTMLImageElement | null {
  const [img, setImg] = useState<{ url: string; el: HTMLImageElement } | null>(null);
  useEffect(() => {
    const el = new window.Image();
    el.onload = () => {
      setImg({ url, el });
    };
    el.src = url;
    return () => {
      el.onload = null;
    };
  }, [url]);
  return img?.url === url ? img.el : null;
}

/**
 * The page with its word boxes. Plain left-drag on empty space draws a box; dragging a box moves
 * it and its handles resize it. Ctrl+wheel (or a touchpad pinch) zooms around the cursor, plain
 * scroll pans, and space+drag or the middle button pans too. Boxes are in image pixels.
 */
export function CanvasStage({
  imageUrl,
  words,
  selectedId,
  lineIds,
  selectedLabel,
  onSelect,
  onChangeBox,
  onDraw,
  onBoxMenu,
  showBoxes = true,
  onViewChange,
  handle,
}: Props) {
  const image = useImage(imageUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  // null = fit the page to the container; set once the user zooms or pans.
  const [userView, setView] = useState<{ scale: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [space, setSpace] = useState(false);
  const [pan, setPan] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // A new page starts fitted.
  const [seenUrl, setSeenUrl] = useState(imageUrl);
  if (seenUrl !== imageUrl) {
    setSeenUrl(imageUrl);
    setView(null);
  }

  const fit = image
    ? (() => {
        const scale = Math.min((size.width - 48) / image.width, (size.height - 48) / image.height, 2);
        return { scale, x: Math.max(24, (size.width - image.width * scale) / 2), y: 24 };
      })()
    : { scale: 1, x: 0, y: 0 };
  const view = userView ?? fit;

  // Overlays (the connector line) follow every render: pan, zoom, box moves.
  // Keyed on the view and boxes only: the parent re-renders in response, which must not loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange is a fresh closure each render
  useEffect(() => onViewChange?.(), [view.x, view.y, view.scale, words, size.width, size.height]);

  useImperativeHandle(handle, () => ({
    zoom(kind) {
      const cx = size.width / 2;
      const cy = size.height / 2;
      if (kind === "fit") {
        setView(null);
        return;
      }
      if (kind === "focus") {
        const w = words.find((x) => x.id === selectedId);
        if (!w) return;
        const scale = Math.min(
          Math.max(Math.min((size.width * 0.35) / w.box.width, (size.height * 0.2) / w.box.height), 0.2),
          8,
        );
        setView({
          scale,
          x: cx - (w.box.x + w.box.width / 2) * scale,
          y: cy - (w.box.y + w.box.height / 2) * scale,
        });
        return;
      }
      const factor = kind === "in" ? 1.25 : 0.8;
      const scale = Math.min(Math.max(view.scale * factor, 0.05), 20);
      const anchor = { x: (cx - view.x) / view.scale, y: (cy - view.y) / view.scale };
      setView({ scale, x: cx - anchor.x * scale, y: cy - anchor.y * scale });
    },
    boxOnScreen(id) {
      const w = words.find((x) => x.id === id);
      const el = containerRef.current;
      if (!w || !el) return null;
      const r = el.getBoundingClientRect();
      const rect = new DOMRect(
        r.left + view.x + w.box.x * view.scale,
        r.top + view.y + w.box.y * view.scale,
        w.box.width * view.scale,
        w.box.height * view.scale,
      );
      const visible =
        rect.bottom > r.top && rect.top < r.bottom && rect.right > r.left && rect.left < r.right;
      return visible ? rect : null;
    },
  }));

  // Attach resize handles to the selected box.
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selectedId ? stage.findOne(`#${CSS.escape(selectedId)}`) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, words]);

  // Wheel and touchpad gestures belong to the canvas: never scroll the page or trigger the
  // browser's back/forward swipe (which flipped to the previous or next page).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (ev: WheelEvent) => {
      ev.preventDefault();
    };
    el.addEventListener("wheel", stop, { passive: false });
    return () => {
      el.removeEventListener("wheel", stop);
    };
  }, []);

  // Hold space to pan with the mouse.
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function toImage(stage: Konva.Stage) {
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const factor = Math.exp(-e.evt.deltaY * 0.0025);
      const scale = Math.min(Math.max(view.scale * factor, 0.05), 20);
      const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
      setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale });
    } else {
      setView({ ...view, x: view.x - e.evt.deltaX, y: view.y - e.evt.deltaY });
    }
  }

  const sel = words.find((w) => w.id === selectedId);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      className="bg-muted/40 relative h-full w-full touch-none overflow-hidden overscroll-none"
      style={{ cursor: pan ? "grabbing" : space ? "grab" : "crosshair" }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        onWheel={onWheel}
        onMouseDown={(e) => {
          const stage = e.target.getStage();
          if (!stage) return;
          if (e.evt.button === 1 || space) {
            e.evt.preventDefault();
            setPan({ x: e.evt.clientX, y: e.evt.clientY, vx: view.x, vy: view.y });
            return;
          }
          if (e.evt.button !== 0) return;
          const onEmpty = e.target === stage || e.target.name() === "page";
          if (!onEmpty) return;
          const p = toImage(stage);
          if (p) setDraft({ x: p.x, y: p.y, width: 0, height: 0 });
        }}
        onMouseMove={(e) => {
          if (pan) {
            setView({ ...view, x: pan.vx + e.evt.clientX - pan.x, y: pan.vy + e.evt.clientY - pan.y });
            return;
          }
          if (!draft) return;
          const stage = e.target.getStage();
          const p = stage ? toImage(stage) : null;
          if (p) setDraft({ ...draft, width: p.x - draft.x, height: p.y - draft.y });
        }}
        onMouseUp={() => {
          setPan(null);
          if (!draft) return;
          const box = normaliseBox(draft);
          setDraft(null);
          // A click without a drag only clears the selection.
          if (box.width * view.scale < 6 || box.height * view.scale < 6) onSelect(null);
          else onDraw(box);
        }}
        onMouseLeave={() => {
          setPan(null);
        }}
      >
        <Layer>
          {image && <KonvaImage image={image} name="page" />}
          {words.map((w) => {
            const selected = w.id === selectedId;
            if (!showBoxes && !selected) return null;
            const state = wordState(w);
            const low = needsCheck(w);
            const color =
              state === "drawn"
                ? DRAWN
                : state === "edited"
                  ? EDITED
                  : state === "verified"
                    ? DONE
                    : low
                      ? WARN
                      : INK;
            return (
              <Rect
                key={w.id}
                id={w.id}
                x={w.box.x}
                y={w.box.y}
                width={w.box.width}
                height={w.box.height}
                stroke={selected ? "#ffffff" : color}
                strokeWidth={selected ? 2 : 1.25}
                fill={
                  selected
                    ? "rgba(111,149,240,0.22)"
                    : lineIds.has(w.id)
                      ? "rgba(111,149,240,0.12)"
                      : "rgba(0,0,0,0.001)"
                }
                strokeScaleEnabled={false}
                {...(low && !selected ? { dash: [4, 3] } : {})}
                draggable={!space}
                onMouseDown={(e) => {
                  if (e.evt.button !== 0 || space) return;
                  e.cancelBubble = true;
                  if (!selected) onSelect(w.id);
                }}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  if (!selected) onSelect(w.id);
                  onBoxMenu?.(w.id, e.evt.clientX, e.evt.clientY);
                }}
                onDragMove={() => onViewChange?.()}
                onDragEnd={(e) => {
                  onChangeBox(w.id, { ...w.box, x: e.target.x(), y: e.target.y() });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const box = {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(2, node.width() * node.scaleX()),
                    height: Math.max(2, node.height() * node.scaleY()),
                  };
                  node.scaleX(1);
                  node.scaleY(1);
                  onChangeBox(w.id, box);
                }}
              />
            );
          })}
          {draft && (
            <Rect
              {...normaliseBox(draft)}
              stroke={DRAWN}
              fill="rgba(192,132,252,0.12)"
              strokeWidth={1.5 / view.scale}
              dash={[6 / view.scale, 4 / view.scale]}
              listening={false}
            />
          )}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            keepRatio={false}
            ignoreStroke
            anchorSize={8}
            anchorStroke={INK}
            anchorFill="#ffffff"
            borderStroke="#ffffff"
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 3 || newBox.height < 3 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
      {sel && selectedLabel && (
        <span
          className="bg-brand text-brand-foreground pointer-events-none absolute rounded px-1.5 py-px text-[11px] font-semibold whitespace-nowrap"
          style={{ left: view.x + sel.box.x * view.scale - 1, top: view.y + sel.box.y * view.scale - 22 }}
        >
          {selectedLabel}
        </span>
      )}
      <span className="bg-card/95 text-muted-foreground pointer-events-none absolute bottom-3 left-3 rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums shadow-sm">
        {Math.round(view.scale * 100)}%
      </span>
      {!image && (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center text-[13px]">
          Loading page…
        </p>
      )}
    </div>
  );
}
