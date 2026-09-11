"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CREW_DRAW_COLORS,
  CREW_DRAW_WIDTH,
  CREW_STROKE_TTL_MS,
  clampPlane,
  colorHex,
  newStrokeId,
  type CrewAnnotateEvent,
  type CrewDrawColorId,
  type CrewDrawPoint,
  type CrewDrawStroke,
  type CrewStrokeMsg,
} from "@/lib/crew-draw";

type Props = {
  active: boolean;
  drawing: boolean;
  color: CrewDrawColorId;
  annotateReady: boolean;
  roomName?: string | null;
  publishStroke: (stroke: CrewStrokeMsg) => void;
  publishClear: () => void;
  subscribeAnnotate: (handler: (event: CrewAnnotateEvent) => void) => () => void;
  onToggleDrawing: () => void;
  onColorChange: (color: CrewDrawColorId) => void;
};

type LiveStroke = {
  id: string;
  color: string;
  width: number;
  cols: number;
  points: CrewDrawPoint[];
  pending: Array<[number, number]>;
  flushTimer: number | null;
};

function mergeStroke(
  prev: CrewDrawStroke | undefined,
  msg: CrewStrokeMsg,
): CrewDrawStroke {
  const incoming = msg.pts.map(([x, y]) => ({
    x: clampPlane(x),
    y: clampPlane(y),
  }));
  // Legacy cell-matrix strokes used large c/r values (e.g. 3.2). Drop those.
  const sane = incoming.filter((p) => p.x <= 1.2 && p.y <= 1.2 && p.x >= -0.2 && p.y >= -0.2);
  const points = prev ? [...prev.points, ...sane] : sane;
  return {
    id: msg.id,
    color: msg.color || colorHex("sea"),
    width: typeof msg.width === "number" ? msg.width : CREW_DRAW_WIDTH,
    points,
    expiresAt: Date.now() + CREW_STROKE_TTL_MS,
  };
}

function readCols(planeEl: HTMLElement): number {
  const grid = planeEl.querySelector<HTMLElement>("[data-crew-grid]");
  if (!grid) return 6;
  return Math.max(
    1,
    Number(grid.dataset.crewCols) ||
      Number.parseInt(
        getComputedStyle(grid).getPropertyValue("--crew-cols").trim(),
        10,
      ) ||
      Number.parseInt(
        getComputedStyle(grid).getPropertyValue("--rack-cols").trim(),
        10,
      ) ||
      6,
  );
}

/** Full draw plane — cells, gutters, and empty margins. */
function clientToPlane(
  clientX: number,
  clientY: number,
  planeEl: HTMLElement,
): CrewDrawPoint | null {
  const rect = planeEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clampPlane((clientX - rect.left) / rect.width),
    y: clampPlane((clientY - rect.top) / rect.height),
  };
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  pixels: Array<{ x: number; y: number }>,
) {
  if (pixels.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pixels[0].x, pixels[0].y);
  if (pixels.length === 1) {
    ctx.lineTo(pixels[0].x + 0.25, pixels[0].y);
    return;
  }
  for (let i = 1; i < pixels.length; i += 1) {
    ctx.lineTo(pixels[i].x, pixels[i].y);
  }
}

export function CrewDrawOverlay({
  active,
  drawing,
  color,
  annotateReady,
  roomName = null,
  publishStroke,
  publishClear,
  subscribeAnnotate,
  onToggleDrawing,
  onColorChange,
}: Props) {
  const [plane, setPlane] = useState<HTMLElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Map<string, CrewDrawStroke>>(new Map());
  const localIdsRef = useRef<Set<string>>(new Set());
  const activePointerRef = useRef<number | null>(null);
  const activeTypeRef = useRef<string | null>(null);
  const liveStrokeRef = useRef<LiveStroke | null>(null);
  const drawingRef = useRef(drawing);
  const colorRef = useRef(color);
  const annotateReadyRef = useRef(annotateReady);
  const publishStrokeRef = useRef(publishStroke);
  const roomRef = useRef(roomName);
  drawingRef.current = drawing;
  colorRef.current = color;
  annotateReadyRef.current = annotateReady;
  publishStrokeRef.current = publishStroke;
  roomRef.current = roomName;

  const [, bump] = useState(0);

  const findPlane = useCallback(() => {
    if (typeof document === "undefined") return null;
    return document.querySelector<HTMLElement>("[data-crew-draw-plane]");
  }, []);

  useEffect(() => {
    if (!active) {
      setPlane(null);
      return;
    }
    const sync = () => setPlane(findPlane());
    sync();
    const id = window.setInterval(sync, 500);
    return () => window.clearInterval(id);
  }, [active, findPlane, roomName]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const planeEl =
      canvas?.parentElement ??
      document.querySelector<HTMLElement>("[data-crew-draw-plane]");
    if (!canvas || !planeEl) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = planeEl.clientWidth;
    const h = planeEl.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const now = Date.now();
    const live = liveStrokeRef.current;
    const minEdge = Math.min(w, h);

    const drawStroke = (stroke: {
      id: string;
      color: string;
      width: number;
      points: CrewDrawPoint[];
      expiresAt?: number;
    }) => {
      if (stroke.points.length < 1) return;
      if (stroke.expiresAt != null) {
        const life = stroke.expiresAt - now;
        if (life <= 0) return;
        const fade = Math.min(1, life / 2800);
        ctx.globalAlpha = 0.3 + 0.7 * fade;
      } else {
        ctx.globalAlpha = 1;
      }
      const pixels = stroke.points.map((pt) => ({
        x: pt.x * w,
        y: pt.y * h,
      }));
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(2.5, stroke.width * minEdge);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      strokePath(ctx, pixels);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    for (const stroke of strokesRef.current.values()) {
      if (live && stroke.id === live.id) continue;
      drawStroke(stroke);
    }
    if (live) drawStroke({ ...live, expiresAt: undefined });
  }, []);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      let changed = false;
      for (const [id, stroke] of strokesRef.current) {
        if (stroke.expiresAt <= now) {
          strokesRef.current.delete(id);
          localIdsRef.current.delete(id);
          changed = true;
        }
      }
      paint();
      if (changed) bump((n) => n + 1);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [active, paint]);

  useEffect(() => {
    if (!active || !plane) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(plane);
    return () => ro.disconnect();
  }, [active, plane, paint]);

  useEffect(() => {
    if (!active) return;
    return subscribeAnnotate((event) => {
      if (event.type === "clear") {
        strokesRef.current.clear();
        localIdsRef.current.clear();
        liveStrokeRef.current = null;
        activePointerRef.current = null;
        activeTypeRef.current = null;
        paint();
        bump((n) => n + 1);
        return;
      }
      if (localIdsRef.current.has(event.stroke.id)) return;
      const strokeRoom = event.stroke.room ?? null;
      const here = roomRef.current ?? null;
      if (strokeRoom && here && strokeRoom !== here) return;

      const prev = strokesRef.current.get(event.stroke.id);
      strokesRef.current.set(event.stroke.id, mergeStroke(prev, event.stroke));
      paint();
      bump((n) => n + 1);
    });
  }, [active, subscribeAnnotate, paint]);

  useEffect(() => {
    if (!active || !plane) return;
    plane.classList.toggle("is-drawing", drawing);
    const host = plane.closest("[data-crew-draw-host]");
    host?.classList.toggle("is-drawing", drawing);
    return () => {
      plane.classList.remove("is-drawing");
      host?.classList.remove("is-drawing");
    };
  }, [active, plane, drawing]);

  useEffect(() => {
    if (!active || !plane || !canvasEl) return;
    const planeEl = plane;
    const canvas = canvasEl;

    function endStroke() {
      const live = liveStrokeRef.current;
      if (live?.flushTimer != null) {
        window.clearTimeout(live.flushTimer);
        live.flushTimer = null;
      }
      if (live && live.pending.length > 0) {
        const pts = live.pending.splice(0, live.pending.length);
        const msg: CrewStrokeMsg = {
          id: live.id,
          color: live.color,
          width: live.width,
          cols: live.cols,
          pts,
          end: true,
          room: roomRef.current ?? null,
        };
        const prev = strokesRef.current.get(live.id);
        strokesRef.current.set(live.id, mergeStroke(prev, msg));
        if (annotateReadyRef.current) publishStrokeRef.current(msg);
      } else if (live) {
        const prev = strokesRef.current.get(live.id);
        if (prev) {
          strokesRef.current.set(live.id, {
            ...prev,
            expiresAt: Date.now() + CREW_STROKE_TTL_MS,
          });
        }
      }
      liveStrokeRef.current = null;
      activePointerRef.current = null;
      activeTypeRef.current = null;
      paint();
    }

    function flushPending(end = false) {
      const live = liveStrokeRef.current;
      if (!live) return;
      if (live.flushTimer != null) {
        window.clearTimeout(live.flushTimer);
        live.flushTimer = null;
      }
      if (live.pending.length === 0 && !end) return;
      const pts = live.pending.splice(0, live.pending.length);
      const msg: CrewStrokeMsg = {
        id: live.id,
        color: live.color,
        width: live.width,
        cols: live.cols,
        pts,
        end: end || undefined,
        room: roomRef.current ?? null,
      };
      const prev = strokesRef.current.get(live.id);
      strokesRef.current.set(live.id, mergeStroke(prev, msg));
      if (annotateReadyRef.current) publishStrokeRef.current(msg);
      paint();
    }

    function appendPoint(pt: CrewDrawPoint) {
      const live = liveStrokeRef.current;
      if (!live) return;
      const last = live.points[live.points.length - 1];
      if (last) {
        const dx = pt.x - last.x;
        const dy = pt.y - last.y;
        const min = activeTypeRef.current === "pen" ? 0.00002 : 0.00008;
        if (dx * dx + dy * dy < min) return;
      }
      live.points.push(pt);
      live.pending.push([pt.x, pt.y]);
      if (live.flushTimer == null) {
        live.flushTimer = window.setTimeout(() => flushPending(false), 32);
      }
    }

    function pointFromEvent(e: PointerEvent): CrewDrawPoint | null {
      return clientToPlane(e.clientX, e.clientY, planeEl);
    }

    function startStroke(e: PointerEvent) {
      const pt = pointFromEvent(e);
      if (!pt) return;
      activePointerRef.current = e.pointerId;
      activeTypeRef.current = e.pointerType || "mouse";
      const id = newStrokeId();
      localIdsRef.current.add(id);
      liveStrokeRef.current = {
        id,
        color: colorHex(colorRef.current),
        width: CREW_DRAW_WIDTH,
        cols: readCols(planeEl),
        points: [pt],
        pending: [[pt.x, pt.y]],
        flushTimer: null,
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* unsupported */
      }
      flushPending(false);
      paint();
    }

    function onPointerDown(e: PointerEvent) {
      if (!drawingRef.current) return;
      if (e.pointerType === "touch" && !e.isPrimary) return;

      if (e.pointerType === "pen") {
        e.preventDefault();
        e.stopPropagation();
        if (
          activePointerRef.current != null &&
          activePointerRef.current !== e.pointerId
        ) {
          endStroke();
        }
        startStroke(e);
        return;
      }

      if (!e.isPrimary) return;
      if (activePointerRef.current != null) return;
      e.preventDefault();
      e.stopPropagation();
      startStroke(e);
    }

    function onPointerMove(e: PointerEvent) {
      if (!drawingRef.current) return;
      if (activePointerRef.current !== e.pointerId) return;
      e.preventDefault();
      const batch =
        typeof e.getCoalescedEvents === "function" &&
        e.getCoalescedEvents().length > 0
          ? e.getCoalescedEvents()
          : [e];
      for (const ev of batch) {
        const pt = pointFromEvent(ev);
        if (pt) appendPoint(pt);
      }
      const predicted =
        typeof (e as PointerEvent & { getPredictedEvents?: () => PointerEvent[] })
          .getPredictedEvents === "function"
          ? (
              e as PointerEvent & {
                getPredictedEvents: () => PointerEvent[];
              }
            ).getPredictedEvents()
          : [];
      for (const ev of predicted) {
        const pt = pointFromEvent(ev);
        if (pt) appendPoint(pt);
      }
      paint();
    }

    function onPointerUp(e: PointerEvent) {
      if (activePointerRef.current !== e.pointerId) return;
      e.preventDefault();
      flushPending(true);
      liveStrokeRef.current = null;
      activePointerRef.current = null;
      activeTypeRef.current = null;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
      paint();
    }

    function onLostCapture() {
      if (liveStrokeRef.current) endStroke();
    }

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
    canvas.addEventListener("lostpointercapture", onLostCapture);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("lostpointercapture", onLostCapture);
      if (liveStrokeRef.current) endStroke();
    };
  }, [active, plane, canvasEl, paint]);

  function clearAll() {
    strokesRef.current.clear();
    localIdsRef.current.clear();
    liveStrokeRef.current = null;
    activePointerRef.current = null;
    activeTypeRef.current = null;
    paint();
    if (annotateReady) publishClear();
    bump((n) => n + 1);
  }

  if (!active) return null;

  const surface =
    plane &&
    createPortal(
      <canvas
        ref={(el) => {
          canvasRef.current = el;
          setCanvasEl((prev) => (prev === el ? prev : el));
        }}
        className={`crew-draw-canvas${drawing ? " is-drawing" : ""}`}
      />,
      plane,
    );

  return (
    <div className={`crew-draw${drawing ? " is-drawing" : ""}`} aria-hidden={!drawing}>
      {surface}
      <div className="crew-draw-tools" role="toolbar" aria-label="Shared draw">
        <button
          type="button"
          className={`crew-draw-btn${drawing ? " on" : ""}`}
          aria-pressed={drawing}
          title={
            annotateReady
              ? "Draw anywhere on the gear plane — cells and gaps"
              : "Draw locally until Live connects"
          }
          onClick={onToggleDrawing}
        >
          {drawing ? "Drawing" : "Draw"}
        </button>
        {drawing ? (
          <>
            <div className="crew-draw-swatches" role="group" aria-label="Ink color">
              {CREW_DRAW_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`crew-draw-swatch${color === c.id ? " on" : ""}`}
                  style={{ background: c.hex }}
                  aria-label={c.id}
                  aria-pressed={color === c.id}
                  onClick={() => onColorChange(c.id)}
                />
              ))}
            </div>
            <button
              type="button"
              className="crew-draw-btn"
              onClick={() => clearAll()}
            >
              Clear
            </button>
          </>
        ) : null}
        {!annotateReady ? (
          <span className="crew-draw-hint">Local until Live</span>
        ) : null}
      </div>
    </div>
  );
}
