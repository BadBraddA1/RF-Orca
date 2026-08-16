export type ChannelStatus = "allowed" | "blocked" | "unreviewed";

/** Fixed A2 rack face — 12 or 24 channel grid. */
export type RackSize = 12 | 24;

export const DEFAULT_RACK_SIZE: RackSize = 12;

export type Room = {
  id: string;
  name: string;
};

/** Named channel group (e.g. Vocals, IEMs) — not a show/crew roster. */
export type ChannelGroup = {
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
  | "rooms";

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
  /** 1-based slot on the 12/24 rack grid. */
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
  features: ShowFeatures;
  /** A2 rack face size for the assignment grid. */
  rackSize: RackSize;
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

export function parseRackSize(raw: unknown): RackSize {
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  return n === 24 ? 24 : DEFAULT_RACK_SIZE;
}

export function formatRackSlot(slot: number): string {
  return String(slot).padStart(2, "0");
}
