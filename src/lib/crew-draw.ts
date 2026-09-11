/** Shared Audio Crew markup — cell-anchored grid coords for cross-device accuracy. */

export const CREW_DRAW_COLORS = [
  { id: "sea", hex: "#5ec8ff" },
  { id: "signal", hex: "#ff8a3d" },
  { id: "foam", hex: "#f2f7ff" },
] as const;

export type CrewDrawColorId = (typeof CREW_DRAW_COLORS)[number]["id"];

/** Fractional column / row within the shared gear matrix (not screen %). */
export type CrewDrawPoint = { c: number; r: number };

export type CrewDrawStroke = {
  id: string;
  color: string;
  width: number;
  cols: number;
  rows: number;
  points: CrewDrawPoint[];
  /** ms epoch — fade then drop (FaceTime-style). */
  expiresAt: number;
};

export type CrewStrokeMsg = {
  id: string;
  color: string;
  width: number;
  /** Shared matrix width — same formula on every tablet. */
  cols: number;
  rows: number;
  /** Fractional (column, row) in the gear matrix. */
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
/** Stroke width as a fraction of one cell's shorter edge. */
export const CREW_DRAW_WIDTH = 0.06;

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
