/** Shared Audio Crew markup — normalized board coords (0–1). */

export const CREW_DRAW_COLORS = [
  { id: "sea", hex: "#5ec8ff" },
  { id: "signal", hex: "#ff8a3d" },
  { id: "foam", hex: "#f2f7ff" },
] as const;

export type CrewDrawColorId = (typeof CREW_DRAW_COLORS)[number]["id"];

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
  pts: Array<[number, number]>;
  end?: boolean;
};

export type CrewClearMsg = {
  clear: true;
  at: string;
};

export type CrewAnnotateEvent =
  | { type: "stroke"; stroke: CrewStrokeMsg }
  | { type: "clear"; at: string };

export const CREW_STROKE_TTL_MS = 14_000;
export const CREW_DRAW_WIDTH = 0.0045; // fraction of board min-edge

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
