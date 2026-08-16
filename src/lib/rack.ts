import type { Channel, RackSize } from "./types";
import { formatRackSlot } from "./types";

/** Map channels onto rack slots 1..size (first wins if duplicates). */
export function channelsByRackSlot(
  channels: Channel[],
  size: RackSize,
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
  size: RackSize,
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

/** Activity copy: "Bradd has Handheld 3". */
export function assignActivityMessage(
  channelName: string,
  assignedTo: string | null,
): string {
  if (!assignedTo) return `Cleared who on ${channelName}`;
  return `${assignedTo} has ${channelName}`;
}
