"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CREW_DRAW_COLORS,
  CREW_DRAW_WIDTH,
  CREW_STROKE_TTL_MS,
  clamp01,
  colorHex,
  newStrokeId,
  type CrewAnnotateEvent,
  type CrewDrawColorId,
  type CrewDrawStroke,
  type CrewStrokeMsg,
} from "@/lib/crew-draw";

type Props = {
  active: boolean;
  drawing: boolean;
  color: CrewDrawColorId;
  annotateReady: boolean;
  publishStroke: (stroke: CrewStrokeMsg) => void;
  publishClear: () => void;
  subscribeAnnotate: (handler: (event: CrewAnnotateEvent) => void) => () => void;
  onToggleDrawing: () => void;
  onColorChange: (color: CrewDrawColorId) => void;
};

type Pt = { x: number; y: number };

function mergeStroke(
  prev: CrewDrawStroke | undefined,
  msg: CrewStrokeMsg,
): CrewDrawStroke {
  const incoming = msg.pts.map(([x, y]) => ({
    x: clamp01(x),
    y: clamp01(y),
  }));
  const points = prev ? [...prev.points, ...incoming] : incoming;
  return {
    id: msg.id,
    color: msg.color || colorHex("sea"),
    width: typeof msg.width === "number" ? msg.width : CREW_DRAW_WIDTH,
    points,
    expiresAt: Date.now() + CREW_STROKE_TTL_MS,
  };
}

/** Midpoint quadratic path — smoother on sparse iPad touch samples. */
function strokePath(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  w: number,
  h: number,
) {
  if (points.length === 0) return;
  const x0 = points[0].x * w;
  const y0 = points[0].y * h;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  if (points.length === 1) {
    ctx.lineTo(x0 + 0.01, y0);
    return;
  }
  if (points.length === 2) {
    ctx.lineTo(points[1].x * w, points[1].y * h);
    return;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const x = points[i].x * w;
    const y = points[i].y * h;
    const nx = points[i + 1].x * w;
    const ny = points[i + 1].y * h;
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x * w, last.y * h);
}

export function CrewDrawOverlay({
  active,
  drawing,
  color,
  annotateReady,
  publishStroke,
  publishClear,
  subscribeAnnotate,
  onToggleDrawing,
  onColorChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Map<string, CrewDrawStroke>>(new Map());
  const localIdsRef = useRef<Set<string>>(new Set());
  const activePointerRef = useRef<number | null>(null);
  const drawingRef = useRef(drawing);
  const colorRef = useRef(color);
  const annotateReadyRef = useRef(annotateReady);
  const publishStrokeRef = useRef(publishStroke);
  drawingRef.current = drawing;
  colorRef.current = color;
  annotateReadyRef.current = annotateReady;
  publishStrokeRef.current = publishStroke;

  const liveStrokeRef = useRef<{
    id: string;
    color: string;
    width: number;
    points: Pt[];
    pending: Array<[number, number]>;
    flushTimer: number | null;
  } | null>(null);
  const [, bump] = useState(0);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
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
    const minEdge = Math.min(w, h);
    const live = liveStrokeRef.current;

    for (const stroke of strokesRef.current.values()) {
      // Live stroke owns the pixels for its id — avoid double-draw / echo glitches.
      if (live && stroke.id === live.id) continue;
      if (stroke.points.length < 1) continue;
      const life = stroke.expiresAt - now;
      if (life <= 0) continue;
      const fade = Math.min(1, life / 2800);
      ctx.globalAlpha = 0.25 + 0.75 * fade;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(2.5, stroke.width * minEdge);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      strokePath(ctx, stroke.points, w, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (live && live.points.length >= 1) {
      ctx.strokeStyle = live.color;
      ctx.lineWidth = Math.max(2.5, live.width * minEdge);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      strokePath(ctx, live.points, w, h);
      ctx.stroke();
    }
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
    if (!active) return;
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [active, paint]);

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
      // Ignore our own Ably echo — re-appending chunks zigzagged back to the
      // stroke start on iPad (sparse flushes). Local merge already has the ink.
      if (localIdsRef.current.has(event.stroke.id)) return;

      const prev = strokesRef.current.get(event.stroke.id);
      strokesRef.current.set(event.stroke.id, mergeStroke(prev, event.stroke));
      paint();
      bump((n) => n + 1);
    });
  }, [active, subscribeAnnotate, paint]);

  // Native pointer listeners: coalesced events + preventDefault work better on iOS.
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    function normFromClient(clientX: number, clientY: number): Pt | null {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: clamp01((clientX - rect.left) / rect.width),
        y: clamp01((clientY - rect.top) / rect.height),
      };
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
        pts,
        end: end || undefined,
      };
      const prev = strokesRef.current.get(live.id);
      strokesRef.current.set(live.id, mergeStroke(prev, msg));
      if (annotateReadyRef.current) publishStrokeRef.current(msg);
      paint();
    }

    function appendPoint(pt: Pt) {
      const live = liveStrokeRef.current;
      if (!live) return;
      const last = live.points[live.points.length - 1];
      if (last) {
        const dx = pt.x - last.x;
        const dy = pt.y - last.y;
        // Slightly looser on touch so slow finger drags still register.
        if (dx * dx + dy * dy < 0.000008) return;
      }
      live.points.push(pt);
      live.pending.push([pt.x, pt.y]);
      if (live.flushTimer == null) {
        live.flushTimer = window.setTimeout(() => flushPending(false), 48);
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (!drawingRef.current) return;
      if (!e.isPrimary) return;
      if (activePointerRef.current != null) return;
      e.preventDefault();
      const pt = normFromClient(e.clientX, e.clientY);
      if (!pt) return;
      activePointerRef.current = e.pointerId;
      const id = newStrokeId();
      localIdsRef.current.add(id);
      const hex = colorHex(colorRef.current);
      liveStrokeRef.current = {
        id,
        color: hex,
        width: CREW_DRAW_WIDTH,
        points: [pt],
        pending: [[pt.x, pt.y]],
        flushTimer: null,
      };
      // Avoid setPointerCapture on iOS — it can corrupt move coordinates.
      const coarse =
        typeof window !== "undefined" &&
        window.matchMedia?.("(pointer: coarse)").matches;
      if (!coarse) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* unsupported */
        }
      }
      flushPending(false);
      paint();
    }

    function onPointerMove(e: PointerEvent) {
      if (!drawingRef.current) return;
      if (activePointerRef.current !== e.pointerId) return;
      e.preventDefault();
      const coalesced =
        typeof e.getCoalescedEvents === "function"
          ? e.getCoalescedEvents()
          : [e];
      const batch = coalesced.length > 0 ? coalesced : [e];
      for (const ev of batch) {
        const pt = normFromClient(ev.clientX, ev.clientY);
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
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
      paint();
    }

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      const live = liveStrokeRef.current;
      if (live?.flushTimer != null) window.clearTimeout(live.flushTimer);
      liveStrokeRef.current = null;
      activePointerRef.current = null;
    };
  }, [active, paint]);

  function clearAll() {
    strokesRef.current.clear();
    localIdsRef.current.clear();
    liveStrokeRef.current = null;
    activePointerRef.current = null;
    paint();
    if (annotateReady) publishClear();
    bump((n) => n + 1);
  }

  if (!active) return null;

  return (
    <div
      ref={wrapRef}
      className={`crew-draw${drawing ? " is-drawing" : ""}`}
      aria-hidden={!drawing}
    >
      <canvas ref={canvasRef} className="crew-draw-canvas" />
      <div className="crew-draw-tools" role="toolbar" aria-label="Shared draw">
        <button
          type="button"
          className={`crew-draw-btn${drawing ? " on" : ""}`}
          aria-pressed={drawing}
          title={
            annotateReady
              ? "Draw on every crew tablet"
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
