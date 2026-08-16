import { getSql, tursoConfigured } from "./db";
import {
  createId,
  createShareToken,
  hashPassword,
} from "./crypto";
import { mergeFeatures, parseFeatures } from "./features";
import { findFreqConflicts, parseActivity } from "./board-helpers";
import { publishShowUpdate } from "./ably";
import type {
  ActivityEvent,
  ActivityKind,
  ActiveShowSummary,
  Channel,
  ChannelGroup,
  ChannelStatus,
  ManualChannelInput,
  ParsedChannelRow,
  Room,
  Show,
  ShowFeatures,
  ShowPublic,
} from "./types";
import { ACTIVE_SHOW_HOME_DAYS, DEFAULT_SHOW_FEATURES } from "./types";

type StoreMode = "memory" | "turso";

const SCHEMA_VERSION = 4;

type GlobalStore = {
  shows: Map<string, Show>;
  channels: Map<string, Channel[]>;
  schemaVersion?: number;
};

function getMemory(): GlobalStore {
  const g = globalThis as typeof globalThis & { __rfOrcaStore?: GlobalStore };
  if (!g.__rfOrcaStore) {
    g.__rfOrcaStore = { shows: new Map(), channels: new Map() };
  }
  return g.__rfOrcaStore;
}

function mode(): StoreMode {
  return tursoConfigured() ? "turso" : "memory";
}

async function ensureColumn(
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const db = getSql();
  const rows = await db.query(`PRAGMA table_info(${table})`);
  const exists = rows.some((r) => String(r.name) === column);
  if (!exists) await db.query(ddl);
}

async function ensureSchema(): Promise<void> {
  if (mode() !== "turso") return;
  const mem = getMemory();
  if (mem.schemaVersion === SCHEMA_VERSION) return;
  const db = getSql();
  await db.query(`
    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      share_token TEXT UNIQUE NOT NULL,
      admin_password_hash TEXT NOT NULL,
      rooms TEXT NOT NULL DEFAULT '[]',
      groups TEXT NOT NULL DEFAULT '[]',
      features TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      frequency_mhz REAL NOT NULL,
      band TEXT,
      type TEXT,
      group_channel TEXT,
      zone TEXT,
      group_name TEXT,
      is_backup INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unreviewed',
      deployed INTEGER NOT NULL DEFAULT 0,
      room_name TEXT,
      assigned_to TEXT,
      deployed_at TEXT,
      deployed_by TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await ensureColumn(
    "shows",
    "groups",
    `ALTER TABLE shows ADD COLUMN groups TEXT NOT NULL DEFAULT '[]'`,
  );
  await ensureColumn(
    "shows",
    "features",
    `ALTER TABLE shows ADD COLUMN features TEXT NOT NULL DEFAULT '{}'`,
  );
  await ensureColumn(
    "shows",
    "revision",
    `ALTER TABLE shows ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`,
  );
  await ensureColumn(
    "shows",
    "activity",
    `ALTER TABLE shows ADD COLUMN activity TEXT NOT NULL DEFAULT '[]'`,
  );
  await ensureColumn(
    "channels",
    "group_name",
    `ALTER TABLE channels ADD COLUMN group_name TEXT`,
  );
  await ensureColumn(
    "channels",
    "assigned_to",
    `ALTER TABLE channels ADD COLUMN assigned_to TEXT`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS channels_show_id_idx ON channels(show_id)`,
  );
  mem.schemaVersion = SCHEMA_VERSION;
}

function parseJsonList<T extends { id: string; name: string }>(
  raw: unknown,
): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toPublic(show: Show, channels: Channel[]): ShowPublic {
  const { adminPasswordHash: _, ...rest } = show;
  return {
    ...rest,
    channels: [...channels].sort((a, b) => a.sortOrder - b.sortOrder),
    storageMode: mode(),
    conflicts: findFreqConflicts(channels),
  };
}

function mapChannelRow(row: Record<string, unknown>): Channel {
  return {
    id: row.id as string,
    showId: row.show_id as string,
    name: row.name as string,
    frequencyMhz: Number(row.frequency_mhz),
    band: (row.band as string) ?? null,
    type: (row.type as string) ?? null,
    groupChannel: (row.group_channel as string) ?? null,
    zone: (row.zone as string) ?? null,
    groupName: (row.group_name as string) ?? null,
    isBackup: Boolean(row.is_backup),
    status: row.status as ChannelStatus,
    deployed: Boolean(row.deployed),
    roomName: (row.room_name as string) ?? null,
    assignedTo: (row.assigned_to as string) ?? null,
    deployedAt: row.deployed_at
      ? new Date(row.deployed_at as string).toISOString()
      : null,
    deployedBy: (row.deployed_by as string) ?? null,
    sortOrder: Number(row.sort_order),
  };
}

function touchShow(
  show: Show,
  kind: ActivityKind,
  message: string,
  channelId?: string | null,
): Show {
  const entry: ActivityEvent = {
    id: createId("act"),
    at: new Date().toISOString(),
    kind,
    message,
    channelId: channelId ?? null,
  };
  return {
    ...show,
    revision: (show.revision ?? 0) + 1,
    activity: [entry, ...(show.activity ?? [])].slice(0, 40),
  };
}

async function persistShowMeta(show: Show): Promise<void> {
  if (mode() === "memory") {
    getMemory().shows.set(show.id, show);
    return;
  }
  const db = getSql();
  await db`
    UPDATE shows SET
      rooms = ${JSON.stringify(show.rooms)},
      groups = ${JSON.stringify(show.groups)},
      features = ${JSON.stringify(show.features)},
      revision = ${show.revision},
      activity = ${JSON.stringify(show.activity)}
    WHERE id = ${show.id}
  `;
}

/** Persist show meta and ping Ably subscribers (no-op without ABLY_API_KEY). */
async function finishMutation(show: Show): Promise<void> {
  await persistShowMeta(show);
  void publishShowUpdate(show.shareToken, show.revision ?? 0);
}

async function getShowByToken(shareToken: string): Promise<Show | null> {
  await ensureSchema();
  if (mode() === "memory") {
    for (const show of getMemory().shows.values()) {
      if (show.shareToken === shareToken) {
        return {
          ...show,
          features: parseFeatures(show.features ?? DEFAULT_SHOW_FEATURES),
          revision: show.revision ?? 0,
          activity: parseActivity(show.activity ?? []),
        };
      }
    }
    return null;
  }
  const db = getSql();
  const rows = await db`
    SELECT id, name, share_token, admin_password_hash, rooms, groups, features,
           revision, activity, created_at
    FROM shows WHERE share_token = ${shareToken} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    shareToken: row.share_token as string,
    adminPasswordHash: row.admin_password_hash as string,
    rooms: parseJsonList<Room>(row.rooms),
    groups: parseJsonList<ChannelGroup>(row.groups),
    features: parseFeatures(row.features),
    revision: Number(row.revision ?? 0),
    activity: parseActivity(row.activity),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

async function getChannels(showId: string): Promise<Channel[]> {
  await ensureSchema();
  if (mode() === "memory") {
    return getMemory().channels.get(showId) ?? [];
  }
  const db = getSql();
  const rows = await db`
    SELECT * FROM channels WHERE show_id = ${showId} ORDER BY sort_order ASC
  `;
  return rows.map((row) => mapChannelRow(row));
}

/** Keep show.groups in sync when a channel gets a new group label. */
function withGroupCatalog(show: Show, groupName: string | null | undefined): Show {
  const name = groupName?.trim();
  if (!name) return show;
  if (show.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
    return show;
  }
  return {
    ...show,
    groups: [...show.groups, { id: createId("grp"), name }],
  };
}

export async function createShow(input: {
  name: string;
  adminPassword: string;
}): Promise<ShowPublic> {
  await ensureSchema();
  const show: Show = {
    id: createId("show"),
    name: input.name.trim(),
    shareToken: createShareToken(),
    adminPasswordHash: hashPassword(input.adminPassword),
    rooms: [],
    groups: [],
    features: { ...DEFAULT_SHOW_FEATURES },
    revision: 0,
    activity: [],
    createdAt: new Date().toISOString(),
  };

  if (mode() === "memory") {
    const mem = getMemory();
    mem.shows.set(show.id, show);
    mem.channels.set(show.id, []);
    return toPublic(show, []);
  }

  const db = getSql();
  await db`
    INSERT INTO shows (
      id, name, share_token, admin_password_hash, rooms, groups, features,
      revision, activity, created_at
    )
    VALUES (
      ${show.id},
      ${show.name},
      ${show.shareToken},
      ${show.adminPasswordHash},
      ${JSON.stringify(show.rooms)},
      ${JSON.stringify(show.groups)},
      ${JSON.stringify(show.features)},
      ${show.revision},
      ${JSON.stringify(show.activity)},
      ${show.createdAt}
    )
  `;
  return toPublic(show, []);
}

export async function getShowPublic(
  shareToken: string,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const channels = await getChannels(show.id);
  return toPublic(show, channels);
}

export async function getShowInternal(
  shareToken: string,
): Promise<Show | null> {
  return getShowByToken(shareToken);
}

export async function getShowRevision(
  shareToken: string,
): Promise<number | null> {
  const show = await getShowByToken(shareToken);
  return show ? show.revision ?? 0 : null;
}

export async function replaceChannelsFromImport(
  shareToken: string,
  rows: ParsedChannelRow[],
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;

  const channels: Channel[] = rows.map((row, index) => ({
    id: createId("ch"),
    showId: show.id,
    name: row.name,
    frequencyMhz: row.frequencyMhz,
    band: row.band,
    type: row.type,
    groupChannel: row.groupChannel,
    zone: row.zone,
    // Prefer WWB zone as the channel group when present.
    groupName: row.zone?.trim() || null,
    isBackup: row.isBackup,
    status: "unreviewed" as const,
    deployed: false,
    roomName: null,
    assignedTo: null,
    deployedAt: null,
    deployedBy: null,
    sortOrder: index,
  }));

  let nextShow = show;
  for (const ch of channels) {
    nextShow = withGroupCatalog(nextShow, ch.groupName);
  }
  nextShow = touchShow(
    nextShow,
    "import",
    `Imported ${channels.length} channels`,
  );

  if (mode() === "memory") {
    getMemory().channels.set(show.id, channels);
    await finishMutation(nextShow);
    return toPublic(nextShow, channels);
  }

  const db = getSql();
  await db`DELETE FROM channels WHERE show_id = ${show.id}`;
  await finishMutation(nextShow);
  for (const ch of channels) {
    await db`
      INSERT INTO channels (
        id, show_id, name, frequency_mhz, band, type, group_channel, zone,
        group_name, is_backup, status, deployed, room_name, assigned_to,
        deployed_at, deployed_by, sort_order
      ) VALUES (
        ${ch.id}, ${ch.showId}, ${ch.name}, ${ch.frequencyMhz}, ${ch.band},
        ${ch.type}, ${ch.groupChannel}, ${ch.zone}, ${ch.groupName},
        ${ch.isBackup}, ${ch.status}, ${ch.deployed}, ${ch.roomName},
        ${ch.assignedTo}, ${ch.deployedAt}, ${ch.deployedBy}, ${ch.sortOrder}
      )
    `;
  }
  return toPublic(nextShow, channels);
}

export async function addManualChannel(
  shareToken: string,
  input: ManualChannelInput,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const existing = await getChannels(show.id);
  const groupName = input.groupName?.trim() || null;
  const channel: Channel = {
    id: createId("ch"),
    showId: show.id,
    name: input.name.trim(),
    frequencyMhz: input.frequencyMhz,
    band: input.band?.trim() || null,
    type: null,
    groupChannel: null,
    zone: null,
    groupName,
    isBackup: false,
    status: "unreviewed",
    deployed: false,
    roomName: null,
    assignedTo: null,
    deployedAt: null,
    deployedBy: null,
    sortOrder: existing.length,
  };

  let nextShow = withGroupCatalog(show, groupName);
  nextShow = touchShow(nextShow, "add", `Added ${channel.name}`, channel.id);
  const channels = [...existing, channel];

  if (mode() === "memory") {
    getMemory().channels.set(show.id, channels);
    await finishMutation(nextShow);
    return toPublic(nextShow, channels);
  }

  await finishMutation(nextShow);
  const db = getSql();
  await db`
    INSERT INTO channels (
      id, show_id, name, frequency_mhz, band, type, group_channel, zone,
      group_name, is_backup, status, deployed, room_name, assigned_to,
      deployed_at, deployed_by, sort_order
    ) VALUES (
      ${channel.id}, ${channel.showId}, ${channel.name}, ${channel.frequencyMhz},
      ${channel.band}, ${channel.type}, ${channel.groupChannel}, ${channel.zone},
      ${channel.groupName}, ${channel.isBackup}, ${channel.status},
      ${channel.deployed}, ${channel.roomName}, ${channel.assignedTo},
      ${channel.deployedAt}, ${channel.deployedBy}, ${channel.sortOrder}
    )
  `;
  return toPublic(nextShow, channels);
}

export async function updateChannel(
  shareToken: string,
  channelId: string,
  patch: Partial<{
    status: ChannelStatus;
    deployed: boolean;
    roomName: string | null;
    groupName: string | null;
    assignedTo: string | null;
    deployedBy: string | null;
  }>,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const channels = await getChannels(show.id);
  const index = channels.findIndex((c) => c.id === channelId);
  if (index < 0) return null;

  const current = channels[index];
  const next: Channel = { ...current };
  let nextShow = show;
  let activityKind: ActivityKind = "status";
  let activityMessage = `Updated ${current.name}`;

  if (patch.status) {
    next.status = patch.status;
    activityKind = "status";
    activityMessage = `Set ${next.name} → ${patch.status}`;
    if (patch.status === "blocked" && next.deployed) {
      next.deployed = false;
      next.roomName = null;
      next.deployedAt = null;
      next.deployedBy = null;
    }
  }

  if (typeof patch.deployed === "boolean") {
    if (patch.deployed && next.status === "blocked") {
      throw new Error("Blocked channels cannot be deployed");
    }
    next.deployed = patch.deployed;
    if (patch.deployed) {
      next.deployedAt = new Date().toISOString();
      next.deployedBy = patch.deployedBy ?? next.deployedBy;
      if (patch.roomName !== undefined) next.roomName = patch.roomName;
      activityKind = "deploy";
      activityMessage = next.roomName
        ? `Deployed ${next.name} → ${next.roomName}`
        : `Deployed ${next.name}`;
    } else {
      next.deployedAt = null;
      next.deployedBy = null;
      next.roomName = null;
      activityKind = "undeploy";
      activityMessage = `Undeployed ${next.name}`;
    }
  } else if (patch.roomName !== undefined) {
    next.roomName = patch.roomName;
    activityKind = "room";
    activityMessage = patch.roomName
      ? `Moved ${next.name} → ${patch.roomName}`
      : `Cleared room for ${next.name}`;
  }

  if (patch.assignedTo !== undefined) {
    next.assignedTo = patch.assignedTo?.trim() || null;
    if (
      typeof patch.deployed !== "boolean" &&
      !patch.status &&
      patch.roomName === undefined &&
      patch.groupName === undefined
    ) {
      activityKind = "assign";
      activityMessage = next.assignedTo
        ? `${next.name} → ${next.assignedTo}`
        : `Cleared who on ${next.name}`;
    }
  }

  if (patch.groupName !== undefined) {
    next.groupName = patch.groupName?.trim() || null;
    nextShow = withGroupCatalog(nextShow, next.groupName);
    if (
      typeof patch.deployed !== "boolean" &&
      !patch.status &&
      patch.roomName === undefined &&
      patch.assignedTo === undefined
    ) {
      activityKind = "groups";
      activityMessage = next.groupName
        ? `Grouped ${next.name} → ${next.groupName}`
        : `Ungrouped ${next.name}`;
    }
  }

  channels[index] = next;
  nextShow = touchShow(nextShow, activityKind, activityMessage, next.id);

  if (mode() === "memory") {
    getMemory().channels.set(show.id, channels);
    await finishMutation(nextShow);
    return toPublic(nextShow, channels);
  }

  await finishMutation(nextShow);
  const db = getSql();
  await db`
    UPDATE channels SET
      status = ${next.status},
      deployed = ${next.deployed},
      room_name = ${next.roomName},
      group_name = ${next.groupName},
      assigned_to = ${next.assignedTo},
      deployed_at = ${next.deployedAt},
      deployed_by = ${next.deployedBy}
    WHERE id = ${next.id} AND show_id = ${show.id}
  `;
  return toPublic(nextShow, channels);
}

export async function bulkSetChannelStatus(
  shareToken: string,
  channelIds: string[],
  status: ChannelStatus,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const idSet = new Set(channelIds);
  if (idSet.size === 0) {
    return toPublic(show, await getChannels(show.id));
  }

  const channels = await getChannels(show.id);
  const next = channels.map((ch) => {
    if (!idSet.has(ch.id)) return ch;
    const updated: Channel = { ...ch, status };
    if (status === "blocked" && updated.deployed) {
      updated.deployed = false;
      updated.roomName = null;
      updated.deployedAt = null;
      updated.deployedBy = null;
    }
    return updated;
  });

  const nextShow = touchShow(
    show,
    "status",
    `Set ${idSet.size} channels → ${status}`,
  );

  if (mode() === "memory") {
    getMemory().channels.set(show.id, next);
    await finishMutation(nextShow);
    return toPublic(nextShow, next);
  }

  await finishMutation(nextShow);
  const db = getSql();
  const clearDeploy = status === "blocked";
  for (const id of idSet) {
    if (clearDeploy) {
      await db`
        UPDATE channels SET
          status = ${status},
          deployed = 0,
          room_name = NULL,
          deployed_at = NULL,
          deployed_by = NULL
        WHERE id = ${id} AND show_id = ${show.id}
      `;
    } else {
      await db`
        UPDATE channels SET status = ${status}
        WHERE id = ${id} AND show_id = ${show.id}
      `;
    }
  }
  return toPublic(nextShow, next);
}

export async function setRooms(
  shareToken: string,
  roomNames: string[],
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const rooms: Room[] = roomNames
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => ({ id: createId("room"), name }));

  const nextShow = touchShow({ ...show, rooms }, "rooms", "Updated rooms");

  if (mode() === "memory") {
    await finishMutation(nextShow);
    const channels = await getChannels(show.id);
    return toPublic(nextShow, channels);
  }

  await finishMutation(nextShow);
  const channels = await getChannels(show.id);
  return toPublic(nextShow, channels);
}

export async function setGroups(
  shareToken: string,
  groupNames: string[],
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const groups: ChannelGroup[] = groupNames
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => {
      const existing = show.groups.find(
        (g) => g.name.toLowerCase() === name.toLowerCase(),
      );
      return existing ?? { id: createId("grp"), name };
    });

  const nextShow = touchShow({ ...show, groups }, "groups", "Updated groups");

  if (mode() === "memory") {
    await finishMutation(nextShow);
    const channels = await getChannels(show.id);
    return toPublic(nextShow, channels);
  }

  await finishMutation(nextShow);
  const channels = await getChannels(show.id);
  return toPublic(nextShow, channels);
}

export async function updateShowFeatures(
  shareToken: string,
  patch: Partial<ShowFeatures>,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const features = mergeFeatures(show.features, patch);
  const nextShow = touchShow(
    { ...show, features },
    "settings",
    "Updated show options",
  );

  if (mode() === "memory") {
    await finishMutation(nextShow);
    return toPublic(nextShow, await getChannels(show.id));
  }

  await finishMutation(nextShow);
  return toPublic(nextShow, await getChannels(show.id));
}

export function getStorageMode(): StoreMode {
  return mode();
}

/**
 * Shows created within the last `days` — for home “happening now”.
 * Older shows stay in the DB; they simply leave this list.
 */
export async function listActiveShows(
  days: number = ACTIVE_SHOW_HOME_DAYS,
): Promise<ActiveShowSummary[]> {
  await ensureSchema();
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  if (mode() === "memory") {
    const mem = getMemory();
    const rows: ActiveShowSummary[] = [];
    for (const show of mem.shows.values()) {
      const created = Date.parse(show.createdAt);
      if (!Number.isFinite(created) || created < cutoffMs) continue;
      const channels = mem.channels.get(show.id) ?? [];
      rows.push({
        name: show.name,
        shareToken: show.shareToken,
        createdAt: show.createdAt,
        channelCount: channels.length,
        deployedCount: channels.filter((c) => c.deployed).length,
      });
    }
    return rows.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  const db = getSql();
  const rows = await db`
    SELECT
      s.name,
      s.share_token,
      s.created_at,
      (
        SELECT COUNT(*) FROM channels c WHERE c.show_id = s.id
      ) AS channel_count,
      (
        SELECT COUNT(*) FROM channels c
        WHERE c.show_id = s.id AND c.deployed = 1
      ) AS deployed_count
    FROM shows s
    WHERE s.created_at >= ${cutoffIso}
    ORDER BY s.created_at DESC
  `;

  return rows.map((row) => ({
    name: row.name as string,
    shareToken: row.share_token as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    channelCount: Number(row.channel_count ?? 0),
    deployedCount: Number(row.deployed_count ?? 0),
  }));
}
