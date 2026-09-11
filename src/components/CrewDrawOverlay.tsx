"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CREW_DRAW_COLORS,
  CREW_DRAW_WIDTH,
  CREW_STROKE_TTL_MS,
  clamp01,
  colorHex,
  crewGridRows,
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
  rows: number;
  points: CrewDrawPoint[];
  pending: Array<[number, number]>;
  flushTimer: number | null;
};

function mergeStroke(
  prev: CrewDrawStroke | undefined,
  msg: CrewStrokeMsg,
): CrewDrawStroke {
  const incoming = msg.pts.map(([c, r]) => ({ c, r }));
  const points = prev ? [...prev.points, ...incoming] : incoming;
  return {
    id: msg.id,
    color: msg.color || colorHex("sea"),
    width: typeof msg.width === "number" ? msg.width : CREW_DRAW_WIDTH,
    cols: msg.cols || prev?.cols || 1,
    rows: msg.rows || prev?.rows || 1,
    points,
    expiresAt: Date.now() + CREW_STROKE_TTL_MS,
  };
}

function readGridMeta(grid: HTMLElement): {
  cols: number;
  rows: number;
  cells: HTMLElement[];
} {
  const cells = [
    ...grid.querySelectorAll<HTMLElement>(".rack-cell[data-crew-index]"),
  ].sort(
    (a, b) =>
      Number(a.dataset.crewIndex ?? 0) - Number(b.dataset.crewIndex ?? 0),
  );
  const cols = Math.max(
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
      1,
  );
  const count = Math.max(
    cells.length,
    Number(grid.dataset.crewCount) || cells.length,
  );
  const rows = crewGridRows(count, cols);
  return { cols, rows, cells };
}

/** Map a screen point onto the shared gear matrix (fractional col/row). */
function clientToMatrix(
  clientX: number,
  clientY: number,
  cells: HTMLElement[],
  cols: number,
  rows: number,
): CrewDrawPoint | null {
  if (cells.length === 0) return null;

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      const index = Number(cell.dataset.crewIndex ?? 0);
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        c: col + clamp01((clientX - rect.left) / rect.width),
        r: row + clamp01((clientY - rect.top) / rect.height),
      };
    }
  }

  // Off-cell (gap / padding): nearest cell edge, still matrix-locked.
  let best: { dist: number; point: CrewDrawPoint } | null = null;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const x = Math.min(rect.right, Math.max(rect.left, clientX));
    const y = Math.min(rect.bottom, Math.max(rect.top, clientY));
    const dx = clientX - x;
    const dy = clientY - y;
    const dist = dx * dx + dy * dy;
    const index = Number(cell.dataset.crewIndex ?? 0);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const point = {
      c: col + clamp01((x - rect.left) / rect.width),
      r: row + clamp01((y - rect.top) / rect.height),
    };
    if (!best || dist < best.dist) best = { dist, point };
  }
  if (best) return best.point;

  return {
    c: Math.min(cols - 1e-6, Math.max(0, 0)),
    r: Math.min(rows - 1e-6, Math.max(0, 0)),
  };
}

/** Map matrix coords onto this tablet's live cell boxes (pixel-accurate). */
function matrixToCanvas(
  point: CrewDrawPoint,
  cells: HTMLElement[],
  cols: number,
  rows: number,
  canvasRect: DOMRect,
): { x: number; y: number } | null {
  if (cells.length === 0) return null;
  const c = Math.min(cols - 1e-9, Math.max(0, point.c));
  const r = Math.min(rows - 1e-9, Math.max(0, point.r));
  const col = Math.min(cols - 1, Math.floor(c));
  const row = Math.min(rows - 1, Math.floor(r));
  const u = c - col;
  const v = r - row;
  const index = row * cols + col;
  const cell = cells[Math.min(cells.length - 1, index)];
  if (!cell) return null;
  const rect = cell.getBoundingClientRect();
  return {
    x: rect.left - canvasRect.left + u * rect.width,
    y: rect.top - canvasRect.top + v * rect.height,
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
  // Straight segments — keep arrow tips on the intended cell.
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
    const grid = planeEl?.querySelector<HTMLElement>("[data-crew-grid]");
    if (!canvas || !planeEl || !grid) return;

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

    const { cols, rows, cells } = readGridMeta(grid);
    const canvasRect = canvas.getBoundingClientRect();
    const now = Date.now();
    const live = liveStrokeRef.current;

    const drawStroke = (stroke: {
      id: string;
      color: string;
      width: number;
      cols: number;
      rows: number;
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
      const useCols = stroke.cols || cols;
      const useRows = stroke.rows || rows;
      const pixels: Array<{ x: number; y: number }> = [];
      for (const pt of stroke.points) {
        const mapped = matrixToCanvas(
          pt,
          cells,
          useCols,
          useRows,
          canvasRect,
        );
        if (mapped) pixels.push(mapped);
      }
      if (pixels.length === 0) return;
      let minEdge = 24;
      if (cells[0]) {
        const r0 = cells[0].getBoundingClientRect();
        minEdge = Math.min(r0.width, r0.height);
      }
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
    const grid = plane.querySelector("[data-crew-grid]");
    if (grid) ro.observe(grid);
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
          rows: live.rows,
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
        rows: live.rows,
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
        const dc = pt.c - last.c;
        const dr = pt.r - last.r;
        // Tighter for pen, looser for finger.
        const min = activeTypeRef.current === "pen" ? 0.00005 : 0.0002;
        if (dc * dc + dr * dr < min) return;
      }
      live.points.push(pt);
      live.pending.push([pt.c, pt.r]);
      if (live.flushTimer == null) {
        live.flushTimer = window.setTimeout(() => flushPending(false), 32);
      }
    }

    function matrixFromEvent(e: PointerEvent): CrewDrawPoint | null {
      const grid = planeEl.querySelector<HTMLElement>("[data-crew-grid]");
      if (!grid) return null;
      const { cols, rows, cells } = readGridMeta(grid);
      return clientToMatrix(e.clientX, e.clientY, cells, cols, rows);
    }

    function startStroke(e: PointerEvent) {
      const grid = planeEl.querySelector<HTMLElement>("[data-crew-grid]");
      if (!grid) return;
      const { cols, rows } = readGridMeta(grid);
      const pt = matrixFromEvent(e);
      if (!pt) return;
      activePointerRef.current = e.pointerId;
      activeTypeRef.current = e.pointerType || "mouse";
      const id = newStrokeId();
      localIdsRef.current.add(id);
      liveStrokeRef.current = {
        id,
        color: colorHex(colorRef.current),
        width: CREW_DRAW_WIDTH,
        cols,
        rows,
        points: [pt],
        pending: [[pt.c, pt.r]],
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

      // Palm / non-primary touch — let Apple Pencil through.
      if (e.pointerType === "touch" && !e.isPrimary) return;

      // Pencil preempts an in-progress finger stroke (common with palm rest).
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
        const pt = matrixFromEvent(ev);
        if (pt) appendPoint(pt);
      }
      // Predicted points (Safari / Pencil) — smoother without waiting.
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
        const pt = matrixFromEvent(ev);
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
              ? "Draw on the gear grid — marks line up on every Live tablet"
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
