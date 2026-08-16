import type { Channel, MicKind } from "./types";
import { formatRackSlot, micKindLabel } from "./types";

/** Map channels onto rack slots 1..size (first wins if duplicates). */
export function channelsByRackSlot(
  channels: Channel[],
  size: number,
): Map<number, Channel> {
  const map = new Map<number, Channel>();
  const sorted = [...channels].sort((a, b) => {
    const sa = a.rackSlot ?? a.sortOrder + 1;
    const sb = b.rackSlot ?? b.sortOrder + 1;
    return sa - sb;
  });
  for (const ch of sorted) {
    const slot = ch.rackSlot ?? ch.sortOrder + 1;
    if (slot < 1 || slot > size) continue;
    if (!map.has(slot)) map.set(slot, ch);
  }
  return map;
}

export function nextOpenRackSlot(
  channels: Channel[],
  size: number,
): number | null {
  const used = new Set(
    channels
      .map((c) => c.rackSlot ?? c.sortOrder + 1)
      .filter((s) => s >= 1 && s <= size),
  );
  for (let i = 1; i <= size; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

export function defaultSlotName(slot: number): string {
  return `CH ${formatRackSlot(slot)}`;
}

/** Auto name when picking Handheld / Lav on a blank or default slot. */
export function nameForMicKind(kind: MicKind, slot: number): string {
  return `${micKindLabel(kind)} ${slot}`;
}

export function shouldAutonameForMicKind(name: string, slot: number): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (n === defaultSlotName(slot).toLowerCase()) return true;
  if (/^ch\s*0*\d+$/i.test(n)) return true;
  if (/^(handheld|hh|lav|lavalier|lapel)\s*0*\d+$/i.test(n)) return true;
  return false;
}

/** Activity copy: "Bradd has Handheld 3". */
export function assignActivityMessage(
  channelName: string,
  assignedTo: string | null,
): string {
  if (!assignedTo) return `Cleared who on ${channelName}`;
  return `${assignedTo} has ${channelName}`;
}
