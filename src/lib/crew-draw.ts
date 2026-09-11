/** Shared Audio Crew markup — plane-normalized coords (gaps + cells). */

export const CREW_DRAW_COLORS = [
  { id: "sea", hex: "#5ec8ff" },
  { id: "signal", hex: "#ff8a3d" },
  { id: "foam", hex: "#f2f7ff" },
] as const;

export type CrewDrawColorId = (typeof CREW_DRAW_COLORS)[number]["id"];

/** 0–1 across the shared draw plane (full gear area, including gutters). */
export type CrewDrawPoint = { x: number; y: number };

export type CrewDrawStroke = {
  id: string;
  color: string;
  width: number;
  points: CrewDrawPoint[];
  /** ms epoch — fade then drop (FaceTime-style). */
  expiresAt: number;
};

export type CrewStrokeMsg = {
  id: string;
  color: string;
  width: number;
  /** Shared column count so every tablet lays out the same gear matrix. */
  cols: number;
  /** Normalized plane coords (0–1), not locked inside a cell. */
  pts: Array<[number, number]>;
  end?: boolean;
  room?: string | null;
};

export type CrewClearMsg = {
  clear: true;
  at: string;
};

export type CrewAnnotateEvent =
  | { type: "stroke"; stroke: CrewStrokeMsg }
  | { type: "clear"; at: string };

export const CREW_STROKE_TTL_MS = 14_000;
/** Stroke width as a fraction of the draw-plane shorter edge. */
export const CREW_DRAW_WIDTH = 0.0045;

export function newStrokeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Allow a little overshoot so strokes at the lip of the plane aren’t clipped. */
export function clampPlane(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1.05, Math.max(-0.05, n));
}

export function colorHex(id: CrewDrawColorId | string): string {
  const found = CREW_DRAW_COLORS.find((c) => c.id === id || c.hex === id);
  return found?.hex ?? CREW_DRAW_COLORS[0].hex;
}

/**
 * Deterministic column count so every crew tablet lays out the same matrix.
 * Prefer wider boards without depending on viewport minmax.
 */
export function crewGridCols(gearCount: number, rackCols?: number): number {
  if (rackCols && rackCols > 0) return rackCols;
  const n = Math.max(1, gearCount);
  if (n <= 4) return Math.min(n, 4);
  if (n <= 8) return 4;
  if (n <= 12) return 6;
  if (n <= 24) return 6;
  if (n <= 40) return 8;
  return 10;
}

export function crewGridRows(gearCount: number, cols: number): number {
  return Math.max(1, Math.ceil(Math.max(1, gearCount) / Math.max(1, cols)));
}
