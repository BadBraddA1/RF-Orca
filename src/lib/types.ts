export type ChannelStatus = "allowed" | "blocked" | "unreviewed";

/** Mic form factor on the A2 rack (not WWB equipment type). */
export type MicKind = "handheld" | "lav";

/** Custom A2 rack face — cols × rows (e.g. 4×1, 3×3, 4×3). */
export type RackLayout = {
  cols: number;
  rows: number;
};

export const MIN_RACK_DIM = 1;
export const MAX_RACK_DIM = 20;
/** Enough for large Workbench imports (e.g. 103 ch → 8×13). */
export const MAX_RACK_SLOTS = 200;

export const DEFAULT_RACK_LAYOUT: RackLayout = { cols: 4, rows: 3 };

/** Common presets for Tools. */
export const RACK_PRESETS: { label: string; cols: number; rows: number }[] = [
  { label: "4×1", cols: 4, rows: 1 },
  { label: "3×3", cols: 3, rows: 3 },
  { label: "4×3", cols: 4, rows: 3 },
  { label: "6×2", cols: 6, rows: 2 },
  { label: "6×4", cols: 6, rows: 4 },
  { label: "8×3", cols: 8, rows: 3 },
];

export type Room = {
  id: string;
  name: string;
};

/** Named channel group (e.g. Vocals, IEMs) — not a show/crew roster. */
export type ChannelGroup = {
  id: string;
  name: string;
};

/** Saved talent / wearer name for reuse across the show. */
export type Person = {
  id: string;
  name: string;
};

/**
 * Per-show feature toggles — coordinator turns on only what the floor needs.
 * Defaults keep a full board; slim shows can disable rooms/groups/status/etc.
 */
export type ShowFeatures = {
  /** Crew can mark Deploy / Deployed */
  deploy: boolean;
  /** Room assignment on deploy */
  rooms: boolean;
  /** Who is on each mic / pack (A2 talent assignments) + rack grid */
  assignments: boolean;
  /** Channel groups (filters, sections, assign) */
  groups: boolean;
  /** Allowed / Blocked / Unreviewed workflow */
  status: boolean;
  /** Once deployed, crew cannot undeploy or change room (admin still can) */
  lockDeployed: boolean;
  /** Freeze all crew marking; board is read-only until unlocked */
  crewLocked: boolean;
};

export const DEFAULT_SHOW_FEATURES: ShowFeatures = {
  deploy: true,
  rooms: true,
  assignments: true,
  groups: true,
  status: true,
  lockDeployed: true,
  crewLocked: false,
};

/** Seconds after deploy when crew may still undo despite lockDeployed. */
export const DEPLOY_UNDO_GRACE_SEC = 8;

export type ActivityKind =
  | "deploy"
  | "undeploy"
  | "room"
  | "assign"
  | "inuse"
  | "status"
  | "import"
  | "add"
  | "settings"
  | "groups"
  | "rooms"
  | "people";

export type ActivityEvent = {
  id: string;
  at: string;
  kind: ActivityKind;
  message: string;
  channelId?: string | null;
};

export type Channel = {
  id: string;
  showId: string;
  name: string;
  frequencyMhz: number;
  band: string | null;
  type: string | null;
  groupChannel: string | null;
  zone: string | null;
  /** User/WWB-assigned channel group label for organizing the mark board. */
  groupName: string | null;
  isBackup: boolean;
  status: ChannelStatus;
  deployed: boolean;
  roomName: string | null;
  /** Talent / wearer on this RF channel (A2 mic assignment). */
  assignedTo: string | null;
  /** Pack currently out / active on the floor. */
  inUse: boolean;
  /** Handheld vs lav on the rack. */
  micKind: MicKind | null;
  /** 1-based slot on the rack grid. */
  rackSlot: number | null;
  deployedAt: string | null;
  deployedBy: string | null;
  sortOrder: number;
};

export type FreqConflict = {
  frequencyMhz: number;
  channels: { id: string; name: string; roomName: string | null }[];
};

export type Show = {
  id: string;
  name: string;
  shareToken: string;
  adminPasswordHash: string;
  rooms: Room[];
  /** Ordered channel-group labels for this show. */
  groups: ChannelGroup[];
  /** Saved names (talent / wearers) for drop-in assignment. */
  people: Person[];
  features: ShowFeatures;
  /** A2 rack columns (width of the grid). */
  rackCols: number;
  /** A2 rack rows (height of the grid). */
  rackRows: number;
  /** Monotonic counter — clients poll and refresh when it changes. */
  revision: number;
  /** Newest-first activity for the live strip (capped). */
  activity: ActivityEvent[];
  createdAt: string;
};

export type ShowPublic = Omit<Show, "adminPasswordHash"> & {
  channels: Channel[];
  storageMode: "memory" | "turso";
  conflicts: FreqConflict[];
};

export type ParsedChannelRow = {
  name: string;
  frequencyMhz: number;
  band: string | null;
  type: string | null;
  groupChannel: string | null;
  zone: string | null;
  isBackup: boolean;
};

export type ManualChannelInput = {
  name: string;
  frequencyMhz: number;
  groupName?: string | null;
  band?: string | null;
};

/** Home “happening now” row — share link only, no secrets. */
export type ActiveShowSummary = {
  name: string;
  shareToken: string;
  createdAt: string;
  channelCount: number;
  deployedCount: number;
};

/** Days a show stays on the home list before it drops off (not deleted). */
export const ACTIVE_SHOW_HOME_DAYS = 10;

export function clampRackDim(n: number): number {
  if (!Number.isFinite(n)) return MIN_RACK_DIM;
  return Math.min(MAX_RACK_DIM, Math.max(MIN_RACK_DIM, Math.round(n)));
}

export function normalizeRackLayout(input: {
  cols?: unknown;
  rows?: unknown;
  /** Legacy single size (12 / 24). */
  rackSize?: unknown;
}): RackLayout {
  const legacy = Number(input.rackSize);
  let cols = Number(input.cols);
  let rows = Number(input.rows);

  if (!Number.isFinite(cols) || cols < 1) {
    if (legacy === 24) cols = 6;
    else if (legacy === 12) cols = 4;
    else cols = DEFAULT_RACK_LAYOUT.cols;
  }
  if (!Number.isFinite(rows) || rows < 1) {
    if (legacy === 24) rows = 4;
    else if (legacy === 12) rows = 3;
    else rows = DEFAULT_RACK_LAYOUT.rows;
  }

  cols = clampRackDim(cols);
  rows = clampRackDim(rows);
  while (cols * rows > MAX_RACK_SLOTS && rows > 1) rows -= 1;
  while (cols * rows > MAX_RACK_SLOTS && cols > 1) cols -= 1;
  return { cols, rows };
}

export function rackSlotCount(
  layout: { rackCols: number; rackRows: number } | RackLayout,
): number {
  if ("cols" in layout) {
    return Math.max(1, layout.cols * layout.rows);
  }
  return Math.max(1, layout.rackCols * layout.rackRows);
}

/** @deprecated Prefer rackSlotCount — kept for gradual migration call sites. */
export type RackSize = number;

export function parseRackSize(raw: unknown): number {
  return rackSlotCount(normalizeRackLayout({ rackSize: raw }));
}

export function formatRackSlot(slot: number): string {
  return String(slot).padStart(2, "0");
}

export function parseMicKind(raw: unknown): MicKind | null {
  if (raw === "handheld" || raw === "lav") return raw;
  return null;
}

export function micKindLabel(kind: MicKind): string {
  return kind === "handheld" ? "Handheld" : "Lav";
}
