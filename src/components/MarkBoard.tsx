"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/BrandLockup";
import { MicRackGrid } from "@/components/MicRackGrid";
import { withinDeployGrace } from "@/lib/board-helpers";
import { channelMatchesQuery, downloadShowCsv } from "@/lib/export-csv";
import { useShowLive } from "@/hooks/useShowLive";
import type {
  Channel,
  ChannelStatus,
  MicKind,
  ShowFeatures,
  ShowPublic,
} from "@/lib/types";
import {
  DEPLOY_UNDO_GRACE_SEC,
  MAX_RACK_DIM,
  RACK_PRESETS,
  rackSlotCount,
} from "@/lib/types";

type Filter =
  | "all"
  | "allowed"
  | "blocked"
  | "deployed"
  | "open"
  | "assigned"
  | "unassigned"
  | "inuse"
  | "spare";

type BoardView = "rack" | "list";

type FocusState = {
  group: string;
  room: string;
};

type ImportPreview = {
  warnings: string[];
  count: number;
  rows: Array<{
    name: string;
    frequencyMhz: number;
    band: string | null;
    zone: string | null;
    isBackup: boolean;
    groupChannel: string | null;
  }>;
  truncated: boolean;
  filename: string;
  csvText: string;
};

type UndoToast = {
  channelId: string;
  channelName: string;
  expiresAt: number;
};

const FEATURE_TOGGLES: {
  key: keyof ShowFeatures;
  label: string;
  hint: string;
}[] = [
  {
    key: "deploy",
    label: "Deploy marking",
    hint: "Crew taps Deploy / Deployed on each channel",
  },
  {
    key: "rooms",
    label: "Rooms",
    hint: "Assign a room or zone when deploying",
  },
  {
    key: "assignments",
    label: "Mic rack assignments",
    hint: "12/24-ch grid — who has which mic, mark in use",
  },
  {
    key: "groups",
    label: "Channel groups",
    hint: "Vocals / IEMs / sections on the board",
  },
  {
    key: "status",
    label: "Allow / Block",
    hint: "Allowed, blocked, and unreviewed workflow",
  },
  {
    key: "lockDeployed",
    label: "Lock after deploy",
    hint: "Crew can’t undo after grace — you still can",
  },
  {
    key: "crewLocked",
    label: "Lock board for crew",
    hint: "Freeze all crew marking — read-only until you unlock",
  },
];

function focusKey(token: string) {
  return `rf-orca-focus:${token}`;
}

function crewKey(token: string) {
  return `rf-orca-crew:${token}`;
}

function flashKey(token: string) {
  return `rf-orca-flash:${token}`;
}

function loadFocus(token: string): FocusState {
  try {
    const raw = localStorage.getItem(focusKey(token));
    if (!raw) return { group: "all", room: "" };
    const parsed = JSON.parse(raw) as FocusState;
    return {
      group: parsed.group || "all",
      room: parsed.room || "",
    };
  } catch {
    return { group: "all", room: "" };
  }
}

function loadBool(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === "1" || raw === "true";
  } catch {
    return fallback;
  }
}

function channelMarkChanged(a: Channel, b: Channel): boolean {
  return (
    a.deployed !== b.deployed ||
    a.roomName !== b.roomName ||
    a.status !== b.status ||
    a.groupName !== b.groupName ||
    a.name !== b.name ||
    a.frequencyMhz !== b.frequencyMhz ||
    a.assignedTo !== b.assignedTo ||
    a.inUse !== b.inUse ||
    a.micKind !== b.micKind ||
    a.rackSlot !== b.rackSlot
  );
}

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function requestElFullscreen(el: HTMLElement | null) {
  if (!el) return;
  const node = el as FullscreenEl;
  const req =
    el.requestFullscreen?.bind(el) ?? node.webkitRequestFullscreen?.bind(el);
  if (!req) return;
  void Promise.resolve(req()).catch(() => {});
}

function exitElFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
  };
  if (!document.fullscreenElement && !doc.webkitFullscreenElement) return;
  const exit =
    document.exitFullscreen?.bind(document) ??
    doc.webkitExitFullscreen?.bind(document);
  if (!exit) return;
  void Promise.resolve(exit()).catch(() => {});
}

export function MarkBoard({
  token,
  initialShow,
  initialAdmin,
}: {
  token: string;
  initialShow: ShowPublic;
  initialAdmin: boolean;
}) {
  const router = useRouter();
  const [show, setShow] = useState(initialShow);
  const [admin, setAdmin] = useState(initialAdmin);
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [focusRoom, setFocusRoom] = useState("");
  const [search, setSearch] = useState("");
  const [boardView, setBoardView] = useState<BoardView>("rack");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [roomsText, setRoomsText] = useState(
    initialShow.rooms.map((r) => r.name).join("\n"),
  );
  const [groupsText, setGroupsText] = useState(
    initialShow.groups.map((g) => g.name).join("\n"),
  );
  const [peopleText, setPeopleText] = useState(
    (initialShow.people ?? []).map((p) => p.name).join("\n"),
  );
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importBusy, setImportBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showNameDraft, setShowNameDraft] = useState(initialShow.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameMsg, setRenameMsg] = useState<string | null>(null);
  const [roomsMsg, setRoomsMsg] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualFreq, setManualFreq] = useState("");
  const [manualGroup, setManualGroup] = useState("");
  const [copied, setCopied] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [rackBusy, setRackBusy] = useState(false);
  const [customCols, setCustomCols] = useState(
    String(initialShow.rackCols ?? 4),
  );
  const [customRows, setCustomRows] = useState(
    String(initialShow.rackRows ?? 3),
  );
  const [undo, setUndo] = useState<UndoToast | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [crewMode, setCrewMode] = useState(false);
  const [flashChanges, setFlashChanges] = useState(false);
  const [flashIds, setFlashIds] = useState<Record<string, number>>({});
  const [lastChangeIds, setLastChangeIds] = useState<string[]>([]);
  const revisionRef = useRef(initialShow.revision ?? 0);
  const channelsRef = useRef(initialShow.channels);
  const flashEnabledRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const features = show.features;

  useEffect(() => {
    const focus = loadFocus(token);
    setGroupFilter(focus.group);
    setFocusRoom(focus.room);
    setCrewMode(loadBool(crewKey(token)));
    setFlashChanges(loadBool(flashKey(token)));
  }, [token]);

  useEffect(() => {
    localStorage.setItem(
      focusKey(token),
      JSON.stringify({ group: groupFilter, room: focusRoom }),
    );
  }, [token, groupFilter, focusRoom]);

  useEffect(() => {
    localStorage.setItem(crewKey(token), crewMode ? "1" : "0");
  }, [token, crewMode]);

  useEffect(() => {
    localStorage.setItem(flashKey(token), flashChanges ? "1" : "0");
    flashEnabledRef.current = flashChanges;
  }, [token, flashChanges]);

  useEffect(() => {
    if (!undo) return;
    const ms = Math.max(0, undo.expiresAt - Date.now());
    const id = window.setTimeout(() => setUndo(null), ms);
    return () => window.clearTimeout(id);
  }, [undo]);

  useEffect(() => {
    const ids = Object.keys(flashIds);
    if (ids.length === 0) return;
    const id = window.setTimeout(() => {
      const cutoff = Date.now() - 2000;
      setFlashIds((prev) => {
        const next: Record<string, number> = {};
        for (const [k, at] of Object.entries(prev)) {
          if (at > cutoff) next[k] = at;
        }
        return next;
      });
    }, 2050);
    return () => window.clearTimeout(id);
  }, [flashIds]);

  const applyShow = useCallback((next: ShowPublic, nextAdmin?: boolean) => {
    const prevMap = new Map(
      channelsRef.current.map((c) => [c.id, c] as const),
    );
    const changed: string[] = [];
    for (const ch of next.channels) {
      const old = prevMap.get(ch.id);
      if (!old || channelMarkChanged(old, ch)) changed.push(ch.id);
    }
    if (changed.length > 0) {
      setLastChangeIds(changed);
      if (flashEnabledRef.current) {
        const at = Date.now();
        setFlashIds((prev) => {
          const merged = { ...prev };
          for (const id of changed) merged[id] = at;
          return merged;
        });
      }
    }
    channelsRef.current = next.channels;
    setShow(next);
    revisionRef.current = next.revision ?? 0;
    if (typeof nextAdmin === "boolean") setAdmin(nextAdmin);
    setShowNameDraft(next.name);
    setRoomsText(next.rooms.map((r) => r.name).join("\n"));
    setGroupsText(next.groups.map((g) => g.name).join("\n"));
    setPeopleText((next.people ?? []).map((p) => p.name).join("\n"));
    setCustomCols(String(next.rackCols ?? 4));
    setCustomRows(String(next.rackRows ?? 3));
  }, []);

  function enterCrewMode() {
    setCrewMode(true);
    setToolsOpen(false);
    if (features.assignments) setBoardView("rack");
    requestElFullscreen(boardRef.current);
  }

  function exitCrewMode() {
    setCrewMode(false);
    exitElFullscreen();
  }

  const refreshFromServer = useCallback(async () => {
    const res = await fetch(`/api/shows/${token}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    startTransition(() => {
      applyShow(data.show, data.admin);
    });
  }, [token, applyShow]);

  const { live, transport } = useShowLive(token, () => {
    void refreshFromServer();
  });

  const groupNames = useMemo(() => {
    if (!features.groups) return [];
    const fromShow = show.groups.map((g) => g.name);
    const fromChannels = show.channels
      .map((c) => c.groupName)
      .filter((n): n is string => Boolean(n));
    return [...new Set([...fromShow, ...fromChannels])];
  }, [show.groups, show.channels, features.groups]);

  const counts = useMemo(() => {
    const channels = show.channels;
    return {
      all: channels.length,
      allowed: channels.filter((c) => c.status === "allowed").length,
      blocked: channels.filter((c) => c.status === "blocked").length,
      deployed: channels.filter((c) => c.deployed).length,
      open: channels.filter((c) => !c.deployed && c.status !== "blocked")
        .length,
      assigned: channels.filter((c) => Boolean(c.assignedTo?.trim())).length,
      unassigned: channels.filter((c) => !c.assignedTo?.trim()).length,
      inuse: channels.filter((c) => c.inUse).length,
      spare: channels.filter((c) => !c.inUse).length,
    };
  }, [show.channels]);

  const assigneeNames = useMemo(() => {
    if (!features.assignments) return [];
    const fromRoster = (show.people ?? []).map((p) => p.name.trim());
    const fromChannels = show.channels
      .map((c) => c.assignedTo?.trim())
      .filter((n): n is string => Boolean(n));
    return [...new Set([...fromRoster, ...fromChannels])].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [show.people, show.channels, features.assignments]);

  const groupProgress = useMemo(() => {
    if (!features.groups || !features.deploy) return [];
    return groupNames.map((name) => {
      const list = show.channels.filter((c) => c.groupName === name);
      const deployed = list.filter((c) => c.deployed).length;
      return { name, deployed, total: list.length };
    });
  }, [groupNames, show.channels, features.groups, features.deploy]);

  const visible = useMemo(() => {
    return show.channels.filter((c) => {
      if (!channelMatchesQuery(c, search)) return false;
      if (focusRoom && (c.roomName ?? "") !== focusRoom) {
        // Focus room: show deployed-in-room OR undeployed (still need to place)
        if (c.deployed) return false;
      }
      if (features.groups && groupFilter !== "all") {
        if (groupFilter === "__ungrouped__") {
          if (c.groupName) return false;
        } else if (c.groupName !== groupFilter) {
          return false;
        }
      }
      if (filter === "allowed") return features.status && c.status === "allowed";
      if (filter === "blocked") return features.status && c.status === "blocked";
      if (filter === "deployed") return features.deploy && c.deployed;
      if (filter === "open") {
        return (
          features.deploy &&
          !c.deployed &&
          (!features.status || c.status !== "blocked")
        );
      }
      if (filter === "assigned") {
        return features.assignments && Boolean(c.assignedTo?.trim());
      }
      if (filter === "unassigned") {
        return features.assignments && !c.assignedTo?.trim();
      }
      if (filter === "inuse") return features.assignments && c.inUse;
      if (filter === "spare") return features.assignments && !c.inUse;
      return true;
    });
  }, [
    show.channels,
    filter,
    groupFilter,
    features,
    search,
    focusRoom,
  ]);

  // When focusing a room, also include channels already deployed to that room
  const visibleWithRoomFocus = useMemo(() => {
    if (!focusRoom) return visible;
    const extra = show.channels.filter(
      (c) =>
        c.roomName === focusRoom &&
        channelMatchesQuery(c, search) &&
        (!features.groups ||
          groupFilter === "all" ||
          (groupFilter === "__ungrouped__"
            ? !c.groupName
            : c.groupName === groupFilter)),
    );
    const ids = new Set(visible.map((c) => c.id));
    return [...visible, ...extra.filter((c) => !ids.has(c.id))];
  }, [
    visible,
    focusRoom,
    show.channels,
    search,
    features.groups,
    groupFilter,
  ]);

  const sections = useMemo(() => {
    const list = visibleWithRoomFocus;
    if (!features.groups) {
      return [{ name: "", channels: list }];
    }
    const map = new Map<string, Channel[]>();
    for (const ch of list) {
      const key = ch.groupName?.trim() || "Ungrouped";
      const bucket = map.get(key) ?? [];
      bucket.push(ch);
      map.set(key, bucket);
    }
    const orderedKeys = [
      ...groupNames.filter((g) => map.has(g)),
      ...(map.has("Ungrouped") ? ["Ungrouped"] : []),
    ];
    for (const key of map.keys()) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }
    return orderedKeys.map((name) => ({ name, channels: map.get(name)! }));
  }, [visibleWithRoomFocus, groupNames, features.groups]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setAdminError(null);
    const res = await fetch(`/api/shows/${token}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action: "unlock" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAdminError(data.error || "Unlock failed");
      return;
    }
    setAdmin(true);
    setPassword("");
  }

  async function lockTools() {
    await fetch(`/api/shows/${token}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    });
    setAdmin(false);
  }

  async function patchFeature(key: keyof ShowFeatures, value: boolean) {
    if (!admin || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const res = await fetch(`/api/shows/${token}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not save setting");
        return;
      }
      applyShow(data.show);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function patchRack(body: {
    cols?: number;
    rows?: number;
    fillEmpty?: boolean;
  }) {
    if (!admin || rackBusy) return;
    setRackBusy(true);
    try {
      const res = await fetch(`/api/shows/${token}/rack`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not update rack");
        return;
      }
      applyShow(data.show);
      setBoardView("rack");
    } finally {
      setRackBusy(false);
    }
  }

  async function patchChannel(
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
    }>,
    opts?: { undoToast?: boolean },
  ) {
    const before = show.channels.find((c) => c.id === channelId);
    const res = await fetch(`/api/shows/${token}/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Update failed");
      return;
    }
    applyShow(data.show);
    if (opts?.undoToast && patch.deployed === true && before) {
      setUndo({
        channelId,
        channelName: before.name,
        expiresAt: Date.now() + 5000,
      });
    }
    if (patch.deployed === false) setUndo(null);
  }

  async function onPickImport(file: File | null) {
    if (!file) {
      setImportMsg("Choose a Workbench CSV file first.");
      return;
    }
    setImportMsg(null);
    setImportPreview(null);
    setImportBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("preview", "1");
      const res = await fetch(`/api/shows/${token}/import`, {
        method: "POST",
        body: form,
      });
      let data: { error?: string; warnings?: string[] } & Partial<ImportPreview>;
      try {
        data = await res.json();
      } catch {
        setImportMsg(
          res.ok
            ? "Import preview failed (bad response)."
            : `Import preview failed (${res.status}).`,
        );
        return;
      }
      if (!res.ok) {
        const warn =
          data.warnings?.length ? ` ${data.warnings.join(" ")}` : "";
        setImportMsg((data.error || "Import preview failed") + warn);
        return;
      }
      setImportPreview(data as ImportPreview);
      setImportMsg(
        `Preview ready — ${data.count ?? 0} channels. Confirm below to replace the board.`,
      );
    } catch (err) {
      setImportMsg(
        err instanceof Error ? err.message : "Import preview failed.",
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const form = new FormData();
      const blob = new Blob([importPreview.csvText], { type: "text/csv" });
      form.append("file", blob, importPreview.filename || "import.csv");
      const res = await fetch(`/api/shows/${token}/import`, {
        method: "POST",
        body: form,
      });
      let data: {
        error?: string;
        warnings?: string[];
        imported?: number;
        show?: ShowPublic;
      };
      try {
        data = await res.json();
      } catch {
        setImportMsg(
          res.ok ? "Import failed (bad response)." : `Import failed (${res.status}).`,
        );
        return;
      }
      if (!res.ok) {
        setImportMsg(data.error || "Import failed");
        return;
      }
      if (data.show) applyShow(data.show);
      const warn =
        data.warnings && data.warnings.length > 0
          ? ` Warnings: ${data.warnings.join(" ")}`
          : "";
      setImportMsg(`Imported ${data.imported} channels.${warn}`);
      setImportPreview(null);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  async function saveShowName(e?: React.FormEvent) {
    e?.preventDefault();
    setRenameMsg(null);
    const name = showNameDraft.trim();
    if (!name) {
      setRenameMsg("Show name required.");
      return;
    }
    if (name === show.name) {
      setRenameMsg("Name unchanged.");
      return;
    }
    setRenameBusy(true);
    try {
      const res = await fetch(`/api/shows/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRenameMsg(data.error || "Could not rename show");
        return;
      }
      applyShow(data.show);
      setRenameMsg("Show renamed.");
    } catch (err) {
      setRenameMsg(err instanceof Error ? err.message : "Could not rename show");
    } finally {
      setRenameBusy(false);
    }
  }

  async function saveRooms() {
    setRoomsMsg(null);
    const rooms = roomsText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
    const res = await fetch(`/api/shows/${token}/rooms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRoomsMsg(data.error || "Could not save rooms");
      return;
    }
    applyShow(data.show);
    setRoomsMsg("Rooms saved. Renames update channels already marked in that room.");
  }

  async function deleteThisShow() {
    setDeleteError(null);
    if (deleteConfirm !== show.name) {
      setDeleteError("Type the show name exactly to confirm.");
      return;
    }
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/shows/${token}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: deleteConfirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || "Could not delete show");
        return;
      }
      router.push("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete show");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveGroups() {
    const groups = groupsText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
    const res = await fetch(`/api/shows/${token}/groups`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not save groups");
      return;
    }
    applyShow(data.show);
  }

  async function savePeople() {
    const people = peopleText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
    const res = await fetch(`/api/shows/${token}/people`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not save names");
      return;
    }
    applyShow(data.show);
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    setImportMsg(null);
    const frequencyMhz = Number.parseFloat(manualFreq);
    if (!manualName.trim() || !Number.isFinite(frequencyMhz)) {
      setImportMsg("Enter a name and frequency in MHz.");
      return;
    }
    const res = await fetch(`/api/shows/${token}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: manualName.trim(),
        frequencyMhz,
        groupName: features.groups ? manualGroup.trim() || null : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(data.error || "Could not add channel");
      return;
    }
    applyShow(data.show);
    setManualName("");
    setManualFreq("");
    setImportMsg(`Added ${manualName.trim()}.`);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function bulkStatus(ids: string[], status: ChannelStatus) {
    if (!admin || !features.status || ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/shows/${token}/channels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ids, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Bulk update failed");
        return;
      }
      applyShow(data.show);
    } finally {
      setBulkBusy(false);
    }
  }

  function jumpToFirstMatch() {
    const first = visibleWithRoomFocus[0];
    if (!first) return;
    setHighlightId(first.id);
    const el = document.getElementById(`ch-${first.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightId(null), 1600);
  }

  const filterOptions = (
    [
      ["all", `All (${counts.all})`],
      features.assignments
        ? (["inuse", `In use (${counts.inuse})`] as const)
        : null,
      features.assignments
        ? (["spare", `Not in use (${counts.spare})`] as const)
        : null,
      features.assignments
        ? (["unassigned", `No who (${counts.unassigned})`] as const)
        : null,
      features.deploy ? (["open", `Open (${counts.open})`] as const) : null,
      features.deploy
        ? (["deployed", `Deployed (${counts.deployed})`] as const)
        : null,
      features.status
        ? (["allowed", `Allowed (${counts.allowed})`] as const)
        : null,
      features.status
        ? (["blocked", `Blocked (${counts.blocked})`] as const)
        : null,
    ] as const
  ).filter(Boolean) as [Filter, string][];

  const pct =
    counts.all > 0 ? Math.round((counts.deployed / counts.all) * 100) : 0;
  const assignPct =
    counts.all > 0 ? Math.round((counts.assigned / counts.all) * 100) : 0;
  const usePct =
    counts.all > 0 ? Math.round((counts.inuse / counts.all) * 100) : 0;
  const showRack = features.assignments && boardView === "rack";
  const slotTotal = rackSlotCount(show);

  return (
    <div
      ref={boardRef}
      className={`board${crewMode ? " board--crew" : ""}`}
    >
      {crewMode ? (
        <header className="crew-bar">
          <div className="crew-bar-main">
            <strong className="crew-show-name">{show.name}</strong>
            <span className={`live-pill${live ? " on" : ""}`}>
              {live
                ? transport === "ably"
                  ? "Live"
                  : "Live · poll"
                : "Reconnecting…"}
            </span>
            {features.assignments ? (
              <span className="crew-progress">
                {counts.inuse}/{counts.all} in use · {counts.assigned} who
              </span>
            ) : features.deploy ? (
              <span className="crew-progress">
                {counts.deployed}/{counts.all}
                {counts.all > 0 ? ` · ${pct}%` : ""}
              </span>
            ) : null}
          </div>
          <div className="crew-bar-actions">
            <label className="crew-toggle">
              <input
                type="checkbox"
                checked={flashChanges}
                onChange={(e) => setFlashChanges(e.target.checked)}
              />
              <span>Flash changes</span>
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => exitCrewMode()}
            >
              Exit Crew
            </button>
          </div>
        </header>
      ) : (
        <header className="board-header">
          <div>
            <BrandLockup size="header" showTagline />
            <h1>{show.name}</h1>
            <p className="board-sub">
              {features.assignments
                ? `${show.rackCols}×${show.rackRows} rack — who has which mic`
                : features.deploy
                  ? "Tap Deploy"
                  : "Frequency board"}
              {features.rooms && !features.assignments ? ", set the room" : ""}
              {features.assignments ? ", mark in use" : ""}.
              <span className={`live-pill${live ? " on" : ""}`}>
                {live
                  ? transport === "ably"
                    ? "Live"
                    : "Live · poll"
                  : "Reconnecting…"}
              </span>
              {show.storageMode === "memory" ? (
                <span className="demo-pill"> Demo storage</span>
              ) : null}
            </p>
          </div>
          <div className="board-actions">
            <label className="crew-toggle">
              <input
                type="checkbox"
                checked={flashChanges}
                onChange={(e) => setFlashChanges(e.target.checked)}
              />
              <span>Flash changes</span>
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => enterCrewMode()}
            >
              Crew
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => downloadShowCsv(show)}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void copyLink()}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className={`btn-quiet${toolsOpen ? " active" : ""}`}
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
            >
              {admin ? "Tools" : "Coordinator"}
            </button>
          </div>
        </header>
      )}

      {!crewMode && features.deploy ? (
        <div className="progress-hud" role="status">
          <div className="progress-hud-top">
            <strong>
              {counts.deployed}/{counts.all} deployed
            </strong>
            <span>{pct}%</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div
              className="progress-fill"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
          {features.assignments ? (
            <div className="progress-assign">
              <strong>
                {counts.inuse}/{counts.all} in use · {counts.assigned} assigned
              </strong>
              <span>{usePct}%</span>
            </div>
          ) : null}
          {groupProgress.length > 0 ? (
            <div className="progress-groups">
              {groupProgress.map((g) => (
                <span key={g.name}>
                  {g.name} {g.deployed}/{g.total}
                  {g.total > 0 && g.deployed === g.total ? " ✓" : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : !crewMode && features.assignments ? (
        <div className="progress-hud" role="status">
          <div className="progress-hud-top">
            <strong>
              {counts.inuse}/{counts.all} in use
            </strong>
            <span>{usePct}%</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div
              className="progress-fill"
              style={{ transform: `scaleX(${usePct / 100})` }}
            />
          </div>
          <div className="progress-assign">
            <strong>
              {counts.assigned}/{counts.all} assigned
            </strong>
            <span>{assignPct}%</span>
          </div>
        </div>
      ) : null}

      {(show.conflicts?.length ?? 0) > 0 ? (
        <div className="board-banner conflict" role="alert">
          <strong>Frequency conflict</strong>
          {show.conflicts.slice(0, 3).map((c) => (
            <span key={c.frequencyMhz}>
              {" "}
              · {c.frequencyMhz.toFixed(3)} MHz (
              {c.channels.map((ch) => ch.name).join(" + ")})
            </span>
          ))}
          {show.conflicts.length > 3
            ? ` · +${show.conflicts.length - 3} more`
            : null}
        </div>
      ) : null}

      {features.crewLocked ? (
        <div className="board-banner locked" role="status">
          Board locked for crew — marking paused.
          {admin ? " You can still edit while Tools are unlocked." : null}
        </div>
      ) : null}

      {!crewMode && (show.activity?.length ?? 0) > 0 ? (
        <div className="activity-strip" aria-label="Recent activity">
          {show.activity.slice(0, 6).map((a) => (
            <div key={a.id} className="activity-item">
              <span className="activity-msg">{a.message}</span>
              <span className="activity-time">
                {formatAgo(a.at)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {!crewMode ? (
      <div className="board-toolbar">
        <label className="search-field">
          <span className="sr-only">Search channels</span>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                jumpToFirstMatch();
              }
            }}
            placeholder={
              features.assignments
                ? "Search who, mic, or MHz…"
                : "Search name or MHz…"
            }
            inputMode="search"
            autoComplete="off"
          />
        </label>
        {features.assignments ? (
          <div className="view-toggle" role="group" aria-label="Board view">
            <button
              type="button"
              className={boardView === "rack" ? "chip active" : "chip"}
              onClick={() => setBoardView("rack")}
            >
              Rack
            </button>
            <button
              type="button"
              className={boardView === "list" ? "chip active" : "chip"}
              onClick={() => setBoardView("list")}
            >
              List
            </button>
          </div>
        ) : null}
        {features.rooms && show.rooms.length > 0 ? (
          <label className="focus-field">
            <span>My room</span>
            <select
              value={focusRoom}
              onChange={(e) => setFocusRoom(e.target.value)}
            >
              <option value="">All rooms</option>
              {show.rooms.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      ) : null}

      {!crewMode && toolsOpen ? (
        <aside className="tools-panel" aria-label="Coordinator tools">
          {!admin ? (
            <form className="tools-unlock" onSubmit={(e) => void unlock(e)}>
              <p className="tools-whisper">Unlock coordinator tools</p>
              <div className="admin-row">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin password"
                  autoComplete="current-password"
                />
                <button type="submit" className="btn-secondary">
                  Unlock
                </button>
              </div>
              {adminError ? <p className="form-error">{adminError}</p> : null}
            </form>
          ) : (
            <div className="tools-body">
              <div className="tools-top">
                <p className="tools-whisper">Coordinator tools</p>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => void lockTools()}
                >
                  Lock tools
                </button>
              </div>

              <form
                className="field show-name-field"
                onSubmit={(e) => void saveShowName(e)}
              >
                <span>Show name</span>
                <div className="admin-row">
                  <input
                    type="text"
                    value={showNameDraft}
                    onChange={(e) => setShowNameDraft(e.target.value)}
                    maxLength={120}
                    disabled={renameBusy}
                    aria-label="Show name"
                  />
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={
                      renameBusy || showNameDraft.trim() === show.name
                    }
                  >
                    {renameBusy ? "Saving…" : "Rename"}
                  </button>
                </div>
                {renameMsg ? (
                  <p
                    className={
                      renameMsg === "Show renamed." ||
                      renameMsg === "Name unchanged."
                        ? "form-hint"
                        : "form-error"
                    }
                  >
                    {renameMsg}
                  </p>
                ) : null}
              </form>

              <div className="feature-toggles" aria-label="Show options">
                <p className="tools-whisper">
                  Show options — use only what you need
                </p>
                {FEATURE_TOGGLES.map((item) => (
                  <label key={item.key} className="toggle-row">
                    <span className="toggle-copy">
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={features[item.key]}
                      disabled={settingsBusy}
                      onChange={(e) =>
                        void patchFeature(item.key, e.target.checked)
                      }
                    />
                  </label>
                ))}
              </div>

              {features.assignments ? (
                <div className="rack-tools" aria-label="Mic rack size">
                  <p className="tools-whisper">Mic rack grid</p>
                  <div className="rack-size-row">
                    {RACK_PRESETS.map((preset) => {
                      const active =
                        show.rackCols === preset.cols &&
                        show.rackRows === preset.rows;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          className={active ? "chip active" : "chip"}
                          disabled={rackBusy}
                          onClick={() =>
                            void patchRack({
                              cols: preset.cols,
                              rows: preset.rows,
                            })
                          }
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rack-custom-row">
                    <label className="quiet-field">
                      <span>Cols</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_RACK_DIM}
                        value={customCols}
                        disabled={rackBusy}
                        onChange={(e) => setCustomCols(e.target.value)}
                      />
                    </label>
                    <span className="rack-times" aria-hidden>
                      ×
                    </span>
                    <label className="quiet-field">
                      <span>Rows</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_RACK_DIM}
                        value={customRows}
                        disabled={rackBusy}
                        onChange={(e) => setCustomRows(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="chip"
                      disabled={rackBusy}
                      onClick={() =>
                        void patchRack({
                          cols: Number(customCols) || 4,
                          rows: Number(customRows) || 3,
                        })
                      }
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="chip"
                      disabled={rackBusy}
                      onClick={() => void patchRack({ fillEmpty: true })}
                    >
                      Fill empty
                    </button>
                  </div>
                  <p className="field-note">
                    Current: {show.rackCols}×{show.rackRows} ({slotTotal}{" "}
                    slots). Tap Handheld / Lav on a cell; set Who; mark In use.
                  </p>
                </div>
              ) : null}

              <div className="tools-grid">
                <div className="field import-field">
                  <span>Import Workbench CSV</span>
                  <div className="import-pick-row">
                    <input
                      ref={importFileRef}
                      className="import-file-input"
                      type="file"
                      accept=".csv,text/csv,text/plain,.txt,.tsv"
                      disabled={importBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void onPickImport(file);
                        // Allow re-picking the same file after a failed attempt
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={importBusy}
                      onClick={() => importFileRef.current?.click()}
                    >
                      {importBusy ? "Reading…" : "Choose CSV"}
                    </button>
                  </div>
                  <span className="field-note">
                    Workbench → export Inventory/Coordination as CSV. Choosing a
                    file builds a preview; then confirm to replace the board.
                  </span>
                  {importMsg ? (
                    <p
                      className={
                        importPreview ? "form-hint" : "form-error"
                      }
                    >
                      {importMsg}
                    </p>
                  ) : null}
                </div>

                {importPreview ? (
                  <div className="import-preview">
                    <p className="tools-whisper">
                      Preview · {importPreview.count} channels
                      {importPreview.truncated ? " (showing first 80)" : ""}
                      {importPreview.filename
                        ? ` · ${importPreview.filename}`
                        : ""}
                    </p>
                    <div className="import-preview-table">
                      {importPreview.rows.slice(0, 12).map((r, i) => (
                        <div key={`${r.name}-${i}`} className="import-row">
                          <strong>{r.name}</strong>
                          <span>
                            {r.band ? `${r.band} · ` : ""}
                            {r.frequencyMhz.toFixed(3)} MHz
                          </span>
                          <span>{r.zone || "—"}</span>
                        </div>
                      ))}
                    </div>
                    {importPreview.warnings.length > 0 ? (
                      <p className="form-hint">
                        {importPreview.warnings.join(" ")}
                      </p>
                    ) : null}
                    <div className="import-preview-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={importBusy}
                        onClick={() => void confirmImport()}
                      >
                        {importBusy
                          ? "Importing…"
                          : `Replace board with ${importPreview.count}`}
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={importBusy}
                        onClick={() => {
                          setImportPreview(null);
                          setImportMsg(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <form
                  className="field manual-add"
                  onSubmit={(e) => void addManual(e)}
                >
                  <span>Add channel by hand</span>
                  <div className="manual-row">
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Name"
                      required
                    />
                    <input
                      value={manualFreq}
                      onChange={(e) => setManualFreq(e.target.value)}
                      placeholder="MHz"
                      inputMode="decimal"
                      required
                    />
                  </div>
                  {features.groups ? (
                    <input
                      value={manualGroup}
                      onChange={(e) => setManualGroup(e.target.value)}
                      placeholder="Group (optional)"
                      list="channel-group-options"
                    />
                  ) : null}
                  <button type="submit" className="btn-secondary">
                    Add channel
                  </button>
                </form>

                {features.groups ? (
                  <label className="field">
                    <span>Channel groups (one per line)</span>
                    <textarea
                      rows={3}
                      value={groupsText}
                      onChange={(e) => setGroupsText(e.target.value)}
                      placeholder={"Vocals\nIEMs\nComms"}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void saveGroups()}
                    >
                      Save groups
                    </button>
                  </label>
                ) : null}

                {features.assignments ? (
                  <label className="field">
                    <span>Saved names (one per line)</span>
                    <textarea
                      rows={4}
                      value={peopleText}
                      onChange={(e) => setPeopleText(e.target.value)}
                      placeholder={"Bradd\nMaya Chen\nJordan Lee"}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void savePeople()}
                    >
                      Save names
                    </button>
                    <span className="field-note">
                      Drop these into any channel’s Who menu. Typing a new Who
                      also saves the name for reuse.
                    </span>
                  </label>
                ) : null}

                {features.rooms ? (
                  <label className="field">
                    <span>Rooms (one per line — edit a line to rename)</span>
                    <textarea
                      rows={3}
                      value={roomsText}
                      onChange={(e) => setRoomsText(e.target.value)}
                      placeholder={"Ballroom A\nGreen Room"}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void saveRooms()}
                    >
                      Save rooms
                    </button>
                    <span className="field-note">
                      Rename by editing the line, then Save. Deployed channels
                      keep the new name. Delete a line to remove that room
                      (clears it from channels).
                    </span>
                    {roomsMsg ? (
                      <p
                        className={
                          roomsMsg.startsWith("Rooms saved")
                            ? "form-hint"
                            : "form-error"
                        }
                      >
                        {roomsMsg}
                      </p>
                    ) : null}
                  </label>
                ) : null}
              </div>

              <div className="danger-zone" aria-label="Danger zone">
                <p className="tools-whisper">Danger zone</p>
                <p className="field-note">
                  Delete this show permanently (channels, assignments, and the
                  share link). Type the show name to confirm.
                </p>
                <div className="admin-row">
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={show.name}
                    autoComplete="off"
                    aria-label="Type show name to confirm delete"
                  />
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={
                      deleteBusy || deleteConfirm !== show.name
                    }
                    onClick={() => void deleteThisShow()}
                  >
                    {deleteBusy ? "Deleting…" : "Delete show"}
                  </button>
                </div>
                {deleteError ? <p className="form-error">{deleteError}</p> : null}
              </div>
            </div>
          )}
        </aside>
      ) : null}

      {features.groups ? (
        <datalist id="channel-group-options">
          {groupNames.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      ) : null}

      {!crewMode &&
      features.groups &&
      (groupNames.length > 0 || show.channels.some((c) => !c.groupName)) ? (
        <div className="filters group-filters" aria-label="Channel groups">
          <button
            type="button"
            className={groupFilter === "all" ? "filter active" : "filter"}
            onClick={() => setGroupFilter("all")}
          >
            All groups
          </button>
          {groupNames.map((g) => (
            <button
              key={g}
              type="button"
              className={groupFilter === g ? "filter active" : "filter"}
              onClick={() => setGroupFilter(g)}
            >
              {g}
            </button>
          ))}
          <button
            type="button"
            className={
              groupFilter === "__ungrouped__" ? "filter active" : "filter"
            }
            onClick={() => setGroupFilter("__ungrouped__")}
          >
            Ungrouped
          </button>
        </div>
      ) : null}

      {!crewMode && filterOptions.length > 1 ? (
        <div className="filters">
          {filterOptions.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "filter active" : "filter"}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {!crewMode &&
      admin &&
      features.status &&
      visibleWithRoomFocus.length > 0 ? (
        <div
          className="bulk-bar"
          role="group"
          aria-label="Bulk status for visible channels"
        >
          <span className="bulk-label">
            Set {visibleWithRoomFocus.length} visible →
          </span>
          <button
            type="button"
            className="chip"
            disabled={bulkBusy}
            onClick={() =>
              void bulkStatus(
                visibleWithRoomFocus.map((c) => c.id),
                "allowed",
              )
            }
          >
            Allowed
          </button>
          <button
            type="button"
            className="chip"
            disabled={bulkBusy}
            onClick={() =>
              void bulkStatus(
                visibleWithRoomFocus.map((c) => c.id),
                "blocked",
              )
            }
          >
            Blocked
          </button>
          <button
            type="button"
            className="chip"
            disabled={bulkBusy}
            onClick={() =>
              void bulkStatus(
                visibleWithRoomFocus.map((c) => c.id),
                "unreviewed",
              )
            }
          >
            Unreviewed
          </button>
        </div>
      ) : null}

      {showRack ? (
        <MicRackGrid
          channels={show.channels}
          rackCols={show.rackCols ?? 4}
          rackRows={show.rackRows ?? 3}
          features={features}
          admin={admin}
          assigneeNames={assigneeNames}
          search={crewMode ? "" : search}
          filterInUse={
            crewMode
              ? "all"
              : filter === "inuse"
                ? "inuse"
                : filter === "spare"
                  ? "spare"
                  : "all"
          }
          filterWho={
            crewMode
              ? "all"
              : filter === "assigned"
                ? "assigned"
                : filter === "unassigned"
                  ? "unassigned"
                  : "all"
          }
          flashIds={flashIds}
          lastChangeIds={lastChangeIds}
          onPatch={async (id, patch) => {
            await patchChannel(id, patch);
          }}
          onFillEmpty={
            admin && !crewMode
              ? async () => patchRack({ fillEmpty: true })
              : undefined
          }
          fillBusy={rackBusy}
        />
      ) : visibleWithRoomFocus.length === 0 ? (
        <div className="empty">
          {show.channels.length === 0
            ? "No channels yet. Coordinators: open Tools to import a Workbench CSV, fill a 12/24 rack, or add channels by hand."
            : "Nothing matches this filter / search."}
        </div>
      ) : (
        <div className="group-sections">
          {sections.map((section) => (
            <section key={section.name || "all"} className="group-section">
              {features.groups && section.name ? (
                <div className="group-heading-row">
                  <h2 className="group-heading">
                    {section.name}
                    <span className="group-count">
                      {section.channels.length}
                    </span>
                  </h2>
                  {admin && features.status ? (
                    <div
                      className="bulk-inline"
                      role="group"
                      aria-label={`Bulk status for ${section.name}`}
                    >
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={bulkBusy}
                        onClick={() =>
                          void bulkStatus(
                            section.channels.map((c) => c.id),
                            "allowed",
                          )
                        }
                      >
                        Allow all
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={bulkBusy}
                        onClick={() =>
                          void bulkStatus(
                            section.channels.map((c) => c.id),
                            "blocked",
                          )
                        }
                      >
                        Block all
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={bulkBusy}
                        onClick={() =>
                          void bulkStatus(
                            section.channels.map((c) => c.id),
                            "unreviewed",
                          )
                        }
                      >
                        Reset all
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ul className="channel-list">
                {section.channels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    rooms={show.rooms.map((r) => r.name)}
                    assigneeNames={assigneeNames}
                    admin={admin}
                    features={features}
                    highlighted={highlightId === channel.id}
                    flashing={Boolean(flashIds[channel.id])}
                    lastChanged={lastChangeIds.includes(channel.id)}
                    conflicted={show.conflicts?.some((c) =>
                      c.channels.some((x) => x.id === channel.id),
                    )}
                    onPatch={patchChannel}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!showRack && features.assignments && assigneeNames.length > 0 ? (
        <datalist id="assignee-options">
          {assigneeNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}

      {undo ? (
        <div className="undo-toast" role="status">
          <span>Deployed {undo.channelName}</span>
          <button
            type="button"
            onClick={() =>
              void patchChannel(undo.channelId, {
                deployed: false,
                roomName: null,
              })
            }
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 45) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function ChannelRow({
  channel,
  rooms,
  assigneeNames,
  admin,
  features,
  highlighted,
  flashing,
  lastChanged,
  conflicted,
  onPatch,
}: {
  channel: Channel;
  rooms: string[];
  assigneeNames: string[];
  admin: boolean;
  features: ShowFeatures;
  highlighted?: boolean;
  flashing?: boolean;
  lastChanged?: boolean;
  conflicted?: boolean;
  onPatch: (
    id: string,
    patch: Partial<{
      status: ChannelStatus;
      deployed: boolean;
      roomName: string | null;
      groupName: string | null;
      assignedTo: string | null;
      inUse: boolean;
      micKind: MicKind | null;
      name: string;
    }>,
    opts?: { undoToast?: boolean },
  ) => Promise<void>;
}) {
  const blocked = features.status && channel.status === "blocked";
  const crewFrozen = features.crewLocked && !admin;
  const inGrace =
    features.lockDeployed &&
    channel.deployed &&
    withinDeployGrace(channel.deployedAt, DEPLOY_UNDO_GRACE_SEC);
  const deployLocked =
    features.lockDeployed && channel.deployed && !admin && !inGrace;
  const markDisabled = blocked || crewFrozen || deployLocked;
  const assignDisabled = crewFrozen;
  const [roomDraft, setRoomDraft] = useState(channel.roomName ?? "");
  const [groupDraft, setGroupDraft] = useState(channel.groupName ?? "");
  const [whoDraft, setWhoDraft] = useState(channel.assignedTo ?? "");

  useEffect(() => {
    setRoomDraft(channel.roomName ?? "");
  }, [channel.roomName]);

  useEffect(() => {
    setGroupDraft(channel.groupName ?? "");
  }, [channel.groupName]);

  useEffect(() => {
    setWhoDraft(channel.assignedTo ?? "");
  }, [channel.assignedTo]);

  return (
    <li
      id={`ch-${channel.id}`}
      className={`channel-row status-${channel.status}${channel.deployed ? " is-deployed" : ""}${channel.inUse ? " is-inuse" : ""}${deployLocked ? " is-locked" : ""}${highlighted ? " is-highlight" : ""}${flashing ? " is-flash" : ""}${lastChanged ? " is-last-change" : ""}${conflicted ? " is-conflict" : ""}`}
    >
      <div className="channel-top-row">
        <div className="channel-main">
          <div className="channel-title">
            {channel.rackSlot != null ? (
              <span className="rack-ch-inline">
                CH {String(channel.rackSlot).padStart(2, "0")}
              </span>
            ) : null}
            <strong>{channel.name}</strong>
            <span className="freq">
              {channel.band ? (
                <span className="band-tag">{channel.band}</span>
              ) : null}
              {channel.band ? " · " : ""}
              {channel.frequencyMhz.toFixed(3)} MHz
            </span>
          </div>
          {features.assignments && channel.assignedTo ? (
            <p className="channel-who">
              {channel.assignedTo} has {channel.name}
            </p>
          ) : null}
          <div className="channel-meta">
            {channel.groupChannel ? (
              <span>G/Ch {channel.groupChannel}</span>
            ) : null}
            {channel.isBackup ? <span className="tag">Backup</span> : null}
            {features.status ? (
              <span className={`tag status-${channel.status}`}>
                {channel.status}
              </span>
            ) : null}
            {features.rooms && channel.deployed && channel.roomName ? (
              <span className="tag deployed-room">{channel.roomName}</span>
            ) : null}
            {conflicted ? <span className="tag conflict-tag">Conflict</span> : null}
            {deployLocked ? (
              <span className="tag locked-tag">Locked</span>
            ) : null}
            {inGrace && !admin ? (
              <span className="tag">Undo ok</span>
            ) : null}
          </div>
        </div>

        {features.deploy ? (
          <button
            type="button"
            className={`deploy-btn${channel.deployed ? " on" : ""}${markDisabled ? " disabled" : ""}`}
            disabled={markDisabled}
            aria-pressed={channel.deployed}
            onClick={() => {
              if (markDisabled) return;
              if (channel.deployed) {
                void onPatch(channel.id, { deployed: false, roomName: null });
                return;
              }
              if (!features.rooms) {
                void onPatch(
                  channel.id,
                  { deployed: true, roomName: null },
                  { undoToast: true },
                );
                return;
              }
              const roomName = channel.roomName || roomDraft.trim() || null;
              if (!roomName && rooms.length === 0) {
                const room = window.prompt("Room?");
                if (!room?.trim()) return;
                setRoomDraft(room.trim());
                void onPatch(
                  channel.id,
                  { deployed: true, roomName: room.trim() },
                  { undoToast: true },
                );
                return;
              }
              void onPatch(
                channel.id,
                {
                  deployed: true,
                  roomName: roomName || (rooms[0] ?? null),
                },
                { undoToast: true },
              );
            }}
          >
            {channel.deployed ? "Deployed" : "Deploy"}
          </button>
        ) : null}
        {features.assignments ? (
          <button
            type="button"
            className={`deploy-btn use-btn${channel.inUse ? " on" : ""}${assignDisabled ? " disabled" : ""}`}
            disabled={assignDisabled}
            aria-pressed={channel.inUse}
            onClick={() =>
              void onPatch(channel.id, { inUse: !channel.inUse })
            }
          >
            {channel.inUse ? "In use" : "Not in use"}
          </button>
        ) : null}
      </div>

      {admin && (features.status || features.groups) ? (
        <div className="admin-inline">
          {features.status ? (
            <label className="quiet-field">
              <span>Status</span>
              <select
                value={channel.status}
                onChange={(e) =>
                  void onPatch(channel.id, {
                    status: e.target.value as ChannelStatus,
                  })
                }
              >
                <option value="unreviewed">unreviewed</option>
                <option value="allowed">allowed</option>
                <option value="blocked">blocked</option>
              </select>
            </label>
          ) : null}
          {features.groups ? (
            <label className="quiet-field">
              <span>Group</span>
              <input
                list="channel-group-options"
                value={groupDraft}
                placeholder="e.g. Vocals"
                onChange={(e) => setGroupDraft(e.target.value)}
                onBlur={() => {
                  const groupName = groupDraft.trim() || null;
                  if (groupName === (channel.groupName ?? null)) return;
                  void onPatch(channel.id, { groupName });
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {features.assignments || features.rooms ? (
        <div className="channel-floor-fields">
          {features.assignments ? (
            <label
              className={`room-field assign-field${assignDisabled ? " disabled" : ""}`}
            >
              <span>Who</span>
              {assigneeNames.length > 0 ? (
                <select
                  className="rack-drop-select"
                  value=""
                  disabled={assignDisabled}
                  aria-label="Drop in saved name"
                  onChange={(e) => {
                    const assignedTo = e.target.value || null;
                    if (!assignedTo) return;
                    setWhoDraft(assignedTo);
                    void onPatch(channel.id, { assignedTo });
                    e.target.value = "";
                  }}
                >
                  <option value="">Drop in name…</option>
                  {assigneeNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                list="assignee-options"
                value={whoDraft}
                disabled={assignDisabled}
                placeholder="Talent / wearer"
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setWhoDraft(e.target.value)}
                onBlur={() => {
                  const assignedTo = whoDraft.trim() || null;
                  if (assignedTo === (channel.assignedTo ?? null)) return;
                  void onPatch(channel.id, { assignedTo });
                }}
              />
            </label>
          ) : null}
          {features.rooms ? (
            <label className={`room-field${markDisabled ? " disabled" : ""}`}>
              <span>Room</span>
              {rooms.length > 0 ? (
                <select
                  value={channel.roomName ?? ""}
                  disabled={markDisabled}
                  onChange={(e) => {
                    const roomName = e.target.value || null;
                    void onPatch(channel.id, {
                      roomName,
                      deployed: Boolean(roomName) || channel.deployed,
                    });
                  }}
                >
                  <option value="">Select room</option>
                  {rooms.map((room) => (
                    <option key={room} value={room}>
                      {room}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={roomDraft}
                  disabled={markDisabled}
                  placeholder="Room / zone"
                  onChange={(e) => setRoomDraft(e.target.value)}
                  onBlur={() => {
                    const roomName = roomDraft.trim() || null;
                    if (roomName === (channel.roomName ?? null)) return;
                    void onPatch(channel.id, {
                      roomName,
                      deployed: Boolean(roomName) || channel.deployed,
                    });
                  }}
                />
              )}
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
