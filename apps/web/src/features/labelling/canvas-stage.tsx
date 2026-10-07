"use client";
import type Konva from "konva";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { LOW_CONFIDENCE, normaliseBox, type Box, type EditableWord } from "./regions";

export type Tool = "select" | "pan" | "draw";

/** Zoom controls the workspace toolbar calls on the canvas. */
export interface CanvasHandle {
  zoom: (kind: "in" | "out" | "fit" | "focus") => void;
}

interface Props {
  imageUrl: string;
  words: EditableWord[];
  selectedId: string | null;
  tool: Tool;
  onSelect: (id: string | null) => void;
  onChangeBox: (id: string, box: Box) => void;
  onDraw: (box: Box) => void;
  /** Receives zoom controls (in/out, fit page, centre on the selected box). */
  handle?: Ref<CanvasHandle> | undefined;
}

const INK = "#2B59C3";
const WARN = "#D9480F";

function useImage(url: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = new window.Image();
    el.onload = () => {
      setImg(el);
    };
    el.src = url;
    return () => {
      el.onload = null;
    };
  }, [url]);
  return img;
}

/**
 * The page with its word boxes. Wheel zooms around the cursor, dragging empty space pans (in
 * select mode) or draws a new box (in draw mode). Boxes are kept in image pixels.
 */
export function CanvasStage({
  imageUrl,
  words,
  selectedId,
  tool,
  onSelect,
  onChangeBox,
  onDraw,
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

  // Track the container size.
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

  const fit = image
    ? (() => {
        const scale = Math.min(size.width / image.width, size.height / image.height) * 0.95;
        return {
          scale,
          x: (size.width - image.width * scale) / 2,
          y: (size.height - image.height * scale) / 2,
        };
      })()
    : { scale: 1, x: 0, y: 0 };
  const view = userView ?? fit;

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

  function toImage(stage: Konva.Stage) {
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
    const scale = Math.min(Math.max(view.scale * factor, 0.05), 20);
    const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale });
  }

  return (
    <div
      ref={containerRef}
      className="bg-muted/60 relative h-full w-full overflow-hidden"
      style={{ cursor: tool === "draw" ? "crosshair" : tool === "pan" ? "grab" : "default" }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={(tool === "select" || tool === "pan") && !draft}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) setView({ ...view, x: e.target.x(), y: e.target.y() });
        }}
        onWheel={onWheel}
        onMouseDown={(e) => {
          const stage = e.target.getStage();
          if (!stage) return;
          const clickedEmpty = e.target === stage || e.target.name() === "page";
          if (tool === "draw") {
            const p = toImage(stage);
            if (p) setDraft({ x: p.x, y: p.y, width: 0, height: 0 });
          } else if (tool === "select" && clickedEmpty) {
            onSelect(null);
          }
        }}
        onMouseMove={(e) => {
          if (!draft) return;
          const stage = e.target.getStage();
          const p = stage ? toImage(stage) : null;
          if (p) setDraft({ ...draft, width: p.x - draft.x, height: p.y - draft.y });
        }}
        onMouseUp={() => {
          if (!draft) return;
          const box = normaliseBox(draft);
          setDraft(null);
          if (box.width >= 3 && box.height >= 3) onDraw(box);
        }}
      >
        <Layer>
          {image && <KonvaImage image={image} name="page" />}
          {words.map((w) => {
            const selected = w.id === selectedId;
            const low = w.conf !== null && w.conf < LOW_CONFIDENCE;
            const color = low ? WARN : INK;
            return (
              <Rect
                key={w.id}
                id={w.id}
                x={w.box.x}
                y={w.box.y}
                width={w.box.width}
                height={w.box.height}
                stroke={color}
                strokeWidth={selected ? 2 : 1}
                fill={`${color}${selected ? "33" : "14"}`}
                strokeScaleEnabled={false}
                {...(low && !selected ? { dash: [4, 3] } : {})}
                draggable={tool === "select" && selected}
                onMouseDown={(e) => {
                  if (tool !== "select") return;
                  e.cancelBubble = true;
                  onSelect(w.id);
                }}
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
              stroke={INK}
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
            borderStroke={INK}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 2 || newBox.height < 2 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
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
