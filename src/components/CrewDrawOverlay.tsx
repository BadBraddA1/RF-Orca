"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  const liveStrokeRef = useRef<{
    id: string;
    color: string;
    width: number;
    points: { x: number; y: number }[];
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
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
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
    for (const stroke of strokesRef.current.values()) {
      if (stroke.points.length < 2) continue;
      const life = stroke.expiresAt - now;
      if (life <= 0) continue;
      const fade = Math.min(1, life / 2800);
      ctx.globalAlpha = 0.25 + 0.75 * fade;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(2.5, stroke.width * minEdge);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const live = liveStrokeRef.current;
    if (live && live.points.length >= 1) {
      ctx.strokeStyle = live.color;
      ctx.lineWidth = Math.max(2.5, live.width * minEdge);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(live.points[0].x * w, live.points[0].y * h);
      for (let i = 1; i < live.points.length; i += 1) {
        ctx.lineTo(live.points[i].x * w, live.points[i].y * h);
      }
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
        paint();
        bump((n) => n + 1);
        return;
      }
      if (localIdsRef.current.has(event.stroke.id)) {
        // Still merge remote end / late chunks for our id if needed
        const prev = strokesRef.current.get(event.stroke.id);
        strokesRef.current.set(
          event.stroke.id,
          mergeStroke(prev, event.stroke),
        );
        paint();
        return;
      }
      const prev = strokesRef.current.get(event.stroke.id);
      strokesRef.current.set(event.stroke.id, mergeStroke(prev, event.stroke));
      paint();
      bump((n) => n + 1);
    });
  }, [active, subscribeAnnotate, paint]);

  function normFromEvent(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
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
    if (annotateReady) publishStroke(msg);
    paint();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    const pt = normFromEvent(e);
    if (!pt) return;
    const id = newStrokeId();
    localIdsRef.current.add(id);
    const hex = colorHex(color);
    liveStrokeRef.current = {
      id,
      color: hex,
      width: CREW_DRAW_WIDTH,
      points: [pt],
      pending: [[pt.x, pt.y]],
      flushTimer: null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    flushPending(false);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const live = liveStrokeRef.current;
    if (!live) return;
    e.preventDefault();
    const pt = normFromEvent(e);
    if (!pt) return;
    const last = live.points[live.points.length - 1];
    if (last) {
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy < 0.00002) return;
    }
    live.points.push(pt);
    live.pending.push([pt.x, pt.y]);
    paint();
    if (live.flushTimer == null) {
      live.flushTimer = window.setTimeout(() => flushPending(false), 40);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!liveStrokeRef.current) return;
    e.preventDefault();
    flushPending(true);
    liveStrokeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  function clearAll() {
    strokesRef.current.clear();
    localIdsRef.current.clear();
    liveStrokeRef.current = null;
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
      <canvas
        ref={canvasRef}
        className="crew-draw-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
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
