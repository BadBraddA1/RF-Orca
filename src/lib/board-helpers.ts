import type { ActivityEvent, Channel, FreqConflict } from "./types";

/** Same frequency deployed in more than one place (or two deployed rows). */
export function findFreqConflicts(channels: Channel[]): FreqConflict[] {
  const byFreq = new Map<number, Channel[]>();
  for (const ch of channels) {
    if (!ch.deployed) continue;
    if (!(ch.frequencyMhz > 0)) continue;
    const key = Math.round(ch.frequencyMhz * 1000) / 1000;
    const list = byFreq.get(key) ?? [];
    list.push(ch);
    byFreq.set(key, list);
  }

  const conflicts: FreqConflict[] = [];
  for (const [frequencyMhz, list] of byFreq) {
    if (list.length < 2) continue;
    const rooms = new Set(
      list.map((c) => (c.roomName?.trim() || "").toLowerCase()),
    );
    // Conflict if multiple deployed on same freq (even same room — duplicate TX risk)
    // Soften: only warn when rooms differ OR >1 without room distinction
    if (rooms.size > 1 || list.length > 1) {
      conflicts.push({
        frequencyMhz,
        channels: list.map((c) => ({
          id: c.id,
          name: c.name,
          roomName: c.roomName,
        })),
      });
    }
  }
  return conflicts.sort((a, b) => a.frequencyMhz - b.frequencyMhz);
}

export function parseActivity(raw: unknown): ActivityEvent[] {
  if (Array.isArray(raw)) return raw as ActivityEvent[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as ActivityEvent[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function withinDeployGrace(
  deployedAt: string | null | undefined,
  graceSec: number,
): boolean {
  if (!deployedAt) return false;
  const t = Date.parse(deployedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= graceSec * 1000;
}
