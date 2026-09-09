import { getSql, tursoConfigured } from "./db";
import {
  createId,
  createShareToken,
  hashPassword,
} from "./crypto";
import { mergeFeatures, parseFeatures } from "./features";
import { findFreqConflicts, parseActivity } from "./board-helpers";
import { publishShowUpdate } from "./ably";
import { assignActivityMessage, defaultSlotName, nextOpenRackSlot, nameForMicKind, shouldAutonameForMicKind } from "./rack";
import type {
  ActivityEvent,
  ActivityKind,
  ActiveShowSummary,
  Channel,
  ChannelGroup,
  ChannelStatus,
  ManualChannelInput,
  MicKind,
  ParsedChannelRow,
  Person,
  Room,
  Show,
  ShowFeatures,
  ShowPublic,
} from "./types";
import {
  ACTIVE_SHOW_HOME_DAYS,
  DEFAULT_RACK_LAYOUT,
  DEFAULT_SHOW_FEATURES,
  micKindLabel,
  normalizeRackLayout,
  parseMicKind,
  rackSlotCount,
} from "./types";

type StoreMode = "memory" | "turso";

const SCHEMA_VERSION = 7;

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
      in_use INTEGER NOT NULL DEFAULT 0,
      mic_kind TEXT,
      rack_slot INTEGER,
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
    "shows",
    "people",
    `ALTER TABLE shows ADD COLUMN people TEXT NOT NULL DEFAULT '[]'`,
  );
  await ensureColumn(
    "shows",
    "rack_size",
    `ALTER TABLE shows ADD COLUMN rack_size INTEGER NOT NULL DEFAULT 12`,
  );
  await ensureColumn(
    "shows",
    "rack_cols",
    `ALTER TABLE shows ADD COLUMN rack_cols INTEGER NOT NULL DEFAULT 4`,
  );
  await ensureColumn(
    "shows",
    "rack_rows",
    `ALTER TABLE shows ADD COLUMN rack_rows INTEGER NOT NULL DEFAULT 3`,
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
  await ensureColumn(
    "channels",
    "in_use",
    `ALTER TABLE channels ADD COLUMN in_use INTEGER NOT NULL DEFAULT 0`,
  );
  await ensureColumn(
    "channels",
    "mic_kind",
    `ALTER TABLE channels ADD COLUMN mic_kind TEXT`,
  );
  await ensureColumn(
    "channels",
    "rack_slot",
    `ALTER TABLE channels ADD COLUMN rack_slot INTEGER`,
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
    inUse: Boolean(row.in_use),
    micKind: parseMicKind(row.mic_kind),
    rackSlot:
      row.rack_slot == null || row.rack_slot === ""
        ? null
        : Number(row.rack_slot),
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
      name = ${show.name},
      rooms = ${JSON.stringify(show.rooms)},
      groups = ${JSON.stringify(show.groups)},
      people = ${JSON.stringify(show.people)},
      features = ${JSON.stringify(show.features)},
      rack_cols = ${show.rackCols},
      rack_rows = ${show.rackRows},
      rack_size = ${rackSlotCount(show)},
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
        const layout = normalizeRackLayout({
          cols: (show as Show).rackCols,
          rows: (show as Show).rackRows,
          rackSize: (show as Show & { rackSize?: number }).rackSize,
        });
        return {
          ...show,
          features: parseFeatures(show.features ?? DEFAULT_SHOW_FEATURES),
          people: parseJsonList<Person>(
            (show as Show).people ?? [],
          ),
          rackCols: layout.cols,
          rackRows: layout.rows,
          revision: show.revision ?? 0,
          activity: parseActivity(show.activity ?? []),
        };
      }
    }
    return null;
  }
  const db = getSql();
  const rows = await db`
    SELECT id, name, share_token, admin_password_hash, rooms, groups, people,
           features, rack_size, rack_cols, rack_rows, revision, activity, created_at
    FROM shows WHERE share_token = ${shareToken} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const layout = normalizeRackLayout({
    cols: row.rack_cols,
    rows: row.rack_rows,
    rackSize: row.rack_size,
  });
  return {
    id: row.id as string,
    name: row.name as string,
    shareToken: row.share_token as string,
    adminPasswordHash: row.admin_password_hash as string,
    rooms: parseJsonList<Room>(row.rooms),
    groups: parseJsonList<ChannelGroup>(row.groups),
    people: parseJsonList<Person>(row.people),
    features: parseFeatures(row.features),
    rackCols: layout.cols,
    rackRows: layout.rows,
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

/** Keep show.people roster in sync when someone is assigned. */
function withPeopleCatalog(show: Show, personName: string | null | undefined): Show {
  const name = personName?.trim();
  if (!name) return show;
  const people = show.people ?? [];
  if (people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return show;
  }
  return {
    ...show,
    people: [...people, { id: createId("per"), name }],
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
    people: [],
    features: { ...DEFAULT_SHOW_FEATURES },
    rackCols: DEFAULT_RACK_LAYOUT.cols,
    rackRows: DEFAULT_RACK_LAYOUT.rows,
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
      id, name, share_token, admin_password_hash, rooms, groups, people, features,
      rack_size, rack_cols, rack_rows, revision, activity, created_at
    )
    VALUES (
      ${show.id},
      ${show.name},
      ${show.shareToken},
      ${show.adminPasswordHash},
      ${JSON.stringify(show.rooms)},
      ${JSON.stringify(show.groups)},
      ${JSON.stringify(show.people)},
      ${JSON.stringify(show.features)},
      ${rackSlotCount(show)},
      ${show.rackCols},
      ${show.rackRows},
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
    inUse: false,
    micKind: null,
    rackSlot: index + 1,
    deployedAt: null,
    deployedBy: null,
    sortOrder: index,
  }));

  let nextShow = show;
  for (const ch of channels) {
    nextShow = withGroupCatalog(nextShow, ch.groupName);
  }
  // Grow rack if import needs more slots than current layout.
  if (channels.length > rackSlotCount(nextShow)) {
    const cols =
      channels.length <= 9
        ? 3
        : channels.length <= 12
          ? 4
          : channels.length <= 48
            ? 6
            : 8;
    const rowsNeeded = Math.ceil(channels.length / cols);
    const layout = normalizeRackLayout({ cols, rows: rowsNeeded });
    nextShow = { ...nextShow, rackCols: layout.cols, rackRows: layout.rows };
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
  // Insert everything first, then bump revision / Ably — otherwise live
  // clients "pop in" channels as each row lands mid-import.
  for (const ch of channels) {
    await db`
      INSERT INTO channels (
        id, show_id, name, frequency_mhz, band, type, group_channel, zone,
        group_name, is_backup, status, deployed, room_name, assigned_to,
        in_use, mic_kind, rack_slot, deployed_at, deployed_by, sort_order
      ) VALUES (
        ${ch.id}, ${ch.showId}, ${ch.name}, ${ch.frequencyMhz}, ${ch.band},
        ${ch.type}, ${ch.groupChannel}, ${ch.zone}, ${ch.groupName},
        ${ch.isBackup}, ${ch.status}, ${ch.deployed}, ${ch.roomName},
        ${ch.assignedTo}, ${ch.inUse ? 1 : 0}, ${ch.micKind}, ${ch.rackSlot},
        ${ch.deployedAt}, ${ch.deployedBy}, ${ch.sortOrder}
      )
    `;
  }
  await finishMutation(nextShow);
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
  const rackSlot =
    nextOpenRackSlot(existing, rackSlotCount(show)) ?? existing.length + 1;
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
    inUse: false,
    micKind: null,
    rackSlot,
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
      in_use, mic_kind, rack_slot, deployed_at, deployed_by, sort_order
    ) VALUES (
      ${channel.id}, ${channel.showId}, ${channel.name}, ${channel.frequencyMhz},
      ${channel.band}, ${channel.type}, ${channel.groupChannel}, ${channel.zone},
      ${channel.groupName}, ${channel.isBackup}, ${channel.status},
      ${channel.deployed}, ${channel.roomName}, ${channel.assignedTo},
      ${channel.inUse ? 1 : 0}, ${channel.micKind}, ${channel.rackSlot},
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
    inUse: boolean;
    micKind: MicKind | null;
    name: string;
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

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name) next.name = name;
  }

  if (patch.status) {
    next.status = patch.status;
    activityKind = "status";
    activityMessage = `Set ${next.name} → ${patch.status}`;
    if (patch.status === "blocked" && next.deployed) {
      next.deployed = false;
      next.deployedAt = null;
      next.deployedBy = null;
      // Keep roomName so a blocked channel can stay prestaged
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
      // Keep roomName so undeploy returns to prestaged (planned room)
      if (patch.roomName !== undefined) next.roomName = patch.roomName;
      activityKind = "undeploy";
      activityMessage = next.roomName
        ? `Undeployed ${next.name} (staged → ${next.roomName})`
        : `Undeployed ${next.name}`;
    }
  } else if (patch.roomName !== undefined) {
    next.roomName = patch.roomName;
    activityKind = "room";
    if (patch.roomName) {
      activityMessage = next.deployed
        ? `Moved ${next.name} → ${patch.roomName}`
        : `Staged ${next.name} → ${patch.roomName}`;
    } else {
      activityMessage = `Cleared room for ${next.name}`;
    }
  }

  if (patch.assignedTo !== undefined) {
    next.assignedTo = patch.assignedTo?.trim() || null;
    nextShow = withPeopleCatalog(nextShow, next.assignedTo);
  }

  if (typeof patch.inUse === "boolean") {
    next.inUse = patch.inUse;
  }

  if (patch.micKind !== undefined) {
    next.micKind = patch.micKind;
    const slot = next.rackSlot ?? next.sortOrder + 1;
    if (
      patch.micKind &&
      patch.name === undefined &&
      shouldAutonameForMicKind(next.name, slot)
    ) {
      next.name = nameForMicKind(patch.micKind, slot);
    }
  }

  if (patch.groupName !== undefined) {
    next.groupName = patch.groupName?.trim() || null;
    nextShow = withGroupCatalog(nextShow, next.groupName);
  }

  // Prefer A2-facing activity copy when assignment / in-use / mic kind changed.
  const onlyMeta =
    typeof patch.deployed !== "boolean" &&
    !patch.status &&
    patch.roomName === undefined;
  if (onlyMeta) {
    if (patch.assignedTo !== undefined) {
      activityKind = "assign";
      activityMessage = assignActivityMessage(next.name, next.assignedTo);
      if (typeof patch.inUse === "boolean") {
        activityMessage += next.inUse ? " · in use" : " · not in use";
      }
    } else if (typeof patch.inUse === "boolean") {
      activityKind = "inuse";
      activityMessage = next.inUse
        ? `${next.name} in use`
        : `${next.name} not in use`;
    } else if (patch.micKind !== undefined) {
      activityKind = "settings";
      activityMessage = next.micKind
        ? `${next.name} → ${micKindLabel(next.micKind)}`
        : `Cleared mic type on ${next.name}`;
    } else if (patch.groupName !== undefined) {
      activityKind = "groups";
      activityMessage = next.groupName
        ? `Grouped ${next.name} → ${next.groupName}`
        : `Ungrouped ${next.name}`;
    } else if (patch.name !== undefined) {
      activityKind = "settings";
      activityMessage = `Renamed → ${next.name}`;
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
      name = ${next.name},
      status = ${next.status},
      deployed = ${next.deployed},
      room_name = ${next.roomName},
      group_name = ${next.groupName},
      assigned_to = ${next.assignedTo},
      in_use = ${next.inUse ? 1 : 0},
      mic_kind = ${next.micKind},
      rack_slot = ${next.rackSlot},
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

export async function bulkSetChannelGroup(
  shareToken: string,
  channelIds: string[],
  groupName: string | null,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const idSet = new Set(channelIds);
  if (idSet.size === 0) {
    return toPublic(show, await getChannels(show.id));
  }

  const nextName = groupName?.trim() || null;
  const channels = await getChannels(show.id);
  const next = channels.map((ch) =>
    idSet.has(ch.id) ? { ...ch, groupName: nextName } : ch,
  );

  let nextShow = withGroupCatalog(show, nextName);
  nextShow = touchShow(
    nextShow,
    "groups",
    nextName
      ? `Grouped ${idSet.size} channels → ${nextName}`
      : `Ungrouped ${idSet.size} channels`,
  );

  if (mode() === "memory") {
    getMemory().channels.set(show.id, next);
    await finishMutation(nextShow);
    return toPublic(nextShow, next);
  }

  await finishMutation(nextShow);
  const db = getSql();
  for (const id of idSet) {
    await db`
      UPDATE channels SET group_name = ${nextName}
      WHERE id = ${id} AND show_id = ${show.id}
    `;
  }
  return toPublic(nextShow, next);
}

/** Prestage (or clear) room on many channels without deploying. */
export async function bulkSetChannelRoom(
  shareToken: string,
  channelIds: string[],
  roomName: string | null,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const idSet = new Set(channelIds);
  if (idSet.size === 0) {
    return toPublic(show, await getChannels(show.id));
  }

  const nextRoom = roomName?.trim() || null;
  const channels = await getChannels(show.id);
  const next = channels.map((ch) =>
    idSet.has(ch.id) ? { ...ch, roomName: nextRoom } : ch,
  );

  const nextShow = touchShow(
    show,
    "rooms",
    nextRoom
      ? `Staged ${idSet.size} channels → ${nextRoom}`
      : `Cleared room on ${idSet.size} channels`,
  );

  if (mode() === "memory") {
    getMemory().channels.set(show.id, next);
    await finishMutation(nextShow);
    return toPublic(nextShow, next);
  }

  await finishMutation(nextShow);
  const db = getSql();
  for (const id of idSet) {
    await db`
      UPDATE channels SET room_name = ${nextRoom}
      WHERE id = ${id} AND show_id = ${show.id}
    `;
  }
  return toPublic(nextShow, next);
}

/** Remove one or more frequencies from the show (admin). */
export async function deleteChannels(
  shareToken: string,
  channelIds: string[],
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const idSet = new Set(channelIds.filter(Boolean));
  if (idSet.size === 0) {
    return toPublic(show, await getChannels(show.id));
  }

  const channels = await getChannels(show.id);
  const removed = channels.filter((ch) => idSet.has(ch.id));
  if (removed.length === 0) {
    return toPublic(show, channels);
  }
  const next = channels.filter((ch) => !idSet.has(ch.id));

  const label =
    removed.length === 1
      ? `Deleted ${removed[0].name} (${removed[0].frequencyMhz} MHz)`
      : `Deleted ${removed.length} frequencies`;

  const nextShow = touchShow(show, "delete", label);

  if (mode() === "memory") {
    getMemory().channels.set(show.id, next);
    await finishMutation(nextShow);
    return toPublic(nextShow, next);
  }

  await finishMutation(nextShow);
  const db = getSql();
  for (const id of idSet) {
    await db`
      DELETE FROM channels
      WHERE id = ${id} AND show_id = ${show.id}
    `;
  }
  return toPublic(nextShow, next);
}

export async function setRooms(
  shareToken: string,
  roomNames: string[],
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;

  const incoming = roomNames.map((n) => n.trim()).filter(Boolean);
  const oldRooms = show.rooms;
  const usedOld = new Set<number>();
  const renameMap = new Map<string, string>(); // old name → new name
  const rooms: Room[] = [];

  // 1) Keep existing rooms whose names still appear (case-insensitive).
  for (const name of incoming) {
    const matchIdx = oldRooms.findIndex(
      (r, i) =>
        !usedOld.has(i) && r.name.toLowerCase() === name.toLowerCase(),
    );
    if (matchIdx >= 0) {
      usedOld.add(matchIdx);
      const old = oldRooms[matchIdx];
      rooms.push({ id: old.id, name });
      if (old.name !== name) renameMap.set(old.name, name);
      continue;
    }
    rooms.push({ id: createId("room"), name });
  }

  // 2) Positional rename — unmatched old → newly added names in order
  //    (covers editing a line in the rooms list without an exact match).
  const unmatchedOld = oldRooms.filter((_, i) => !usedOld.has(i));
  const keptIds = new Set(
    rooms
      .filter((r) =>
        oldRooms.some((o, oi) => usedOld.has(oi) && o.id === r.id),
      )
      .map((r) => r.id),
  );
  const brandNewOrRenamed = rooms.filter((r) => !keptIds.has(r.id));
  const pairCount = Math.min(unmatchedOld.length, brandNewOrRenamed.length);
  for (let i = 0; i < pairCount; i++) {
    const from = unmatchedOld[i].name;
    const to = brandNewOrRenamed[i].name;
    if (from !== to) renameMap.set(from, to);
    const roomIdx = rooms.findIndex((r) => r.id === brandNewOrRenamed[i].id);
    if (roomIdx >= 0) {
      rooms[roomIdx] = { id: unmatchedOld[i].id, name: to };
    }
  }

  const removedNames = unmatchedOld.slice(pairCount).map((r) => r.name);

  const channels = await getChannels(show.id);
  let touched = 0;
  const nextChannels = channels.map((ch) => {
    if (!ch.roomName) return ch;
    if (renameMap.has(ch.roomName)) {
      touched += 1;
      return { ...ch, roomName: renameMap.get(ch.roomName)! };
    }
    if (removedNames.includes(ch.roomName)) {
      touched += 1;
      return { ...ch, roomName: null };
    }
    // Case-only rename already in renameMap; also handle if room list
    // kept the name via case change through renameMap.
    return ch;
  });

  const renameNote =
    renameMap.size > 0
      ? ` · renamed ${[...renameMap.entries()].map(([a, b]) => `${a}→${b}`).join(", ")}`
      : "";
  const nextShow = touchShow(
    { ...show, rooms },
    "rooms",
    `Updated rooms${renameNote}`,
  );

  if (mode() === "memory") {
    getMemory().channels.set(show.id, nextChannels);
    await finishMutation(nextShow);
    return toPublic(nextShow, nextChannels);
  }

  await finishMutation(nextShow);
  if (touched > 0) {
    const db = getSql();
    for (const ch of nextChannels) {
      const prev = channels.find((c) => c.id === ch.id);
      if (!prev || prev.roomName === ch.roomName) continue;
      await db`
        UPDATE channels SET room_name = ${ch.roomName}
        WHERE id = ${ch.id} AND show_id = ${show.id}
      `;
    }
  }
  return toPublic(nextShow, nextChannels);
}

export async function deleteShow(shareToken: string): Promise<boolean> {
  const show = await getShowByToken(shareToken);
  if (!show) return false;

  if (mode() === "memory") {
    const mem = getMemory();
    mem.shows.delete(show.id);
    mem.channels.delete(show.id);
    return true;
  }

  const db = getSql();
  await db`DELETE FROM channels WHERE show_id = ${show.id}`;
  await db`DELETE FROM shows WHERE id = ${show.id}`;
  return true;
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

export async function setPeople(
  shareToken: string,
  personNames: string[],
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const raw of personNames) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = (show.people ?? []).find(
      (p) => p.name.toLowerCase() === key,
    );
    people.push(existing ?? { id: createId("per"), name });
  }

  const nextShow = touchShow(
    { ...show, people },
    "people",
    `Saved ${people.length} names`,
  );
  await finishMutation(nextShow);
  return toPublic(nextShow, await getChannels(show.id));
}

export async function renameShow(
  shareToken: string,
  name: string,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const nextName = name.trim();
  if (!nextName) return null;
  if (nextName === show.name) {
    return toPublic(show, await getChannels(show.id));
  }
  const nextShow = touchShow(
    { ...show, name: nextName },
    "settings",
    `Renamed show → ${nextName}`,
  );
  await finishMutation(nextShow);
  return toPublic(nextShow, await getChannels(show.id));
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

export async function setRackLayout(
  shareToken: string,
  cols: number,
  rows: number,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const layout = normalizeRackLayout({ cols, rows });
  const nextShow = touchShow(
    { ...show, rackCols: layout.cols, rackRows: layout.rows },
    "settings",
    `Rack set to ${layout.cols}×${layout.rows} (${layout.cols * layout.rows} ch)`,
  );
  await finishMutation(nextShow);
  return toPublic(nextShow, await getChannels(show.id));
}

/** @deprecated Prefer setRackLayout */
export async function setRackSize(
  shareToken: string,
  rackSize: number,
): Promise<ShowPublic | null> {
  const layout = normalizeRackLayout({ rackSize });
  return setRackLayout(shareToken, layout.cols, layout.rows);
}

/** Fill empty rack slots with placeholder channels (CH 01 …). */
export async function fillRackSlots(
  shareToken: string,
): Promise<ShowPublic | null> {
  const show = await getShowByToken(shareToken);
  if (!show) return null;
  const size = rackSlotCount(show);
  const existing = await getChannels(show.id);
  const bySlot = new Map<number, Channel>();
  for (const ch of existing) {
    const slot = ch.rackSlot ?? ch.sortOrder + 1;
    if (slot >= 1 && slot <= size && !bySlot.has(slot)) {
      bySlot.set(slot, ch);
    }
  }

  const added: Channel[] = [];
  for (let slot = 1; slot <= size; slot += 1) {
    if (bySlot.has(slot)) continue;
    added.push({
      id: createId("ch"),
      showId: show.id,
      name: defaultSlotName(slot),
      frequencyMhz: 0,
      band: null,
      type: null,
      groupChannel: null,
      zone: null,
      groupName: null,
      isBackup: false,
      status: "unreviewed",
      deployed: false,
      roomName: null,
      assignedTo: null,
      inUse: false,
      micKind: null,
      rackSlot: slot,
      deployedAt: null,
      deployedBy: null,
      sortOrder: existing.length + added.length,
    });
  }

  if (added.length === 0) {
    return toPublic(show, existing);
  }

  const channels = [...existing, ...added];
  const nextShow = touchShow(
    show,
    "add",
    `Filled ${added.length} empty rack slots`,
  );

  if (mode() === "memory") {
    getMemory().channels.set(show.id, channels);
    await finishMutation(nextShow);
    return toPublic(nextShow, channels);
  }

  await finishMutation(nextShow);
  const db = getSql();
  for (const ch of added) {
    await db`
      INSERT INTO channels (
        id, show_id, name, frequency_mhz, band, type, group_channel, zone,
        group_name, is_backup, status, deployed, room_name, assigned_to,
        in_use, mic_kind, rack_slot, deployed_at, deployed_by, sort_order
      ) VALUES (
        ${ch.id}, ${ch.showId}, ${ch.name}, ${ch.frequencyMhz}, ${ch.band},
        ${ch.type}, ${ch.groupChannel}, ${ch.zone}, ${ch.groupName},
        ${ch.isBackup}, ${ch.status}, ${ch.deployed}, ${ch.roomName},
        ${ch.assignedTo}, ${ch.inUse ? 1 : 0}, ${ch.micKind}, ${ch.rackSlot},
        ${ch.deployedAt}, ${ch.deployedBy}, ${ch.sortOrder}
      )
    `;
  }
  return toPublic(nextShow, channels);
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
