"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { withinDeployGrace } from "@/lib/board-helpers";
import { channelMatchesQuery, downloadShowCsv } from "@/lib/export-csv";
import { useShowLive } from "@/hooks/useShowLive";
import type {
  Channel,
  ChannelStatus,
  ShowFeatures,
  ShowPublic,
} from "@/lib/types";
import { DEPLOY_UNDO_GRACE_SEC } from "@/lib/types";

type Filter =
  | "all"
  | "allowed"
  | "blocked"
  | "deployed"
  | "open"
  | "assigned"
  | "unassigned";

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
    label: "Mic assignments",
    hint: "Who is on each RF channel — live for A2s",
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

export function MarkBoard({
  token,
  initialShow,
  initialAdmin,
}: {
  token: string;
  initialShow: ShowPublic;
  initialAdmin: boolean;
}) {
  const [show, setShow] = useState(initialShow);
  const [admin, setAdmin] = useState(initialAdmin);
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [focusRoom, setFocusRoom] = useState("");
  const [search, setSearch] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [roomsText, setRoomsText] = useState(
    initialShow.rooms.map((r) => r.name).join("\n"),
  );
  const [groupsText, setGroupsText] = useState(
    initialShow.groups.map((g) => g.name).join("\n"),
  );
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importBusy, setImportBusy] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualFreq, setManualFreq] = useState("");
  const [manualGroup, setManualGroup] = useState("");
  const [copied, setCopied] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [undo, setUndo] = useState<UndoToast | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const revisionRef = useRef(initialShow.revision ?? 0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const features = show.features;

  useEffect(() => {
    const focus = loadFocus(token);
    setGroupFilter(focus.group);
    setFocusRoom(focus.room);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(
      focusKey(token),
      JSON.stringify({ group: groupFilter, room: focusRoom }),
    );
  }, [token, groupFilter, focusRoom]);

  useEffect(() => {
    if (!undo) return;
    const ms = Math.max(0, undo.expiresAt - Date.now());
    const id = window.setTimeout(() => setUndo(null), ms);
    return () => window.clearTimeout(id);
  }, [undo]);

  const applyShow = useCallback((next: ShowPublic, nextAdmin?: boolean) => {
    setShow(next);
    revisionRef.current = next.revision ?? 0;
    if (typeof nextAdmin === "boolean") setAdmin(nextAdmin);
    setRoomsText(next.rooms.map((r) => r.name).join("\n"));
    setGroupsText(next.groups.map((g) => g.name).join("\n"));
  }, []);

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
    };
  }, [show.channels]);

  const assigneeNames = useMemo(() => {
    if (!features.assignments) return [];
    const names = show.channels
      .map((c) => c.assignedTo?.trim())
      .filter((n): n is string => Boolean(n));
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [show.channels, features.assignments]);

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

  async function patchChannel(
    channelId: string,
    patch: Partial<{
      status: ChannelStatus;
      deployed: boolean;
      roomName: string | null;
      groupName: string | null;
      assignedTo: string | null;
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
    if (!file) return;
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
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(data.error || "Import preview failed");
        return;
      }
      setImportPreview(data as ImportPreview);
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
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(data.error || "Import failed");
        return;
      }
      applyShow(data.show);
      const warn =
        data.warnings?.length > 0
          ? ` Warnings: ${data.warnings.join(" ")}`
          : "";
      setImportMsg(`Imported ${data.imported} channels.${warn}`);
      setImportPreview(null);
    } finally {
      setImportBusy(false);
    }
  }

  async function saveRooms() {
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
      alert(data.error || "Could not save rooms");
      return;
    }
    applyShow(data.show);
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
      features.deploy ? (["open", `Open (${counts.open})`] as const) : null,
      features.deploy
        ? (["deployed", `Deployed (${counts.deployed})`] as const)
        : null,
      features.assignments
        ? (["unassigned", `No who (${counts.unassigned})`] as const)
        : null,
      features.assignments
        ? (["assigned", `Assigned (${counts.assigned})`] as const)
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

  return (
    <div className="board">
      <header className="board-header">
        <div>
          <BrandLockup size="header" showTagline />
          <h1>{show.name}</h1>
          <p className="board-sub">
            {features.deploy ? "Tap Deploy" : "Frequency board"}
            {features.rooms ? ", set the room" : ""}
            {features.assignments ? ", who is on each mic" : ""}.
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

      {features.deploy ? (
        <div className="progress-hud" role="status">
          <div className="progress-hud-top">
            <strong>
              {counts.deployed}/{counts.all} deployed
            </strong>
            <span>{pct}%</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {features.assignments ? (
            <div className="progress-assign">
              <strong>
                {counts.assigned}/{counts.all} assigned
              </strong>
              <span>{assignPct}%</span>
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
      ) : features.assignments ? (
        <div className="progress-hud" role="status">
          <div className="progress-hud-top">
            <strong>
              {counts.assigned}/{counts.all} assigned
            </strong>
            <span>{assignPct}%</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${assignPct}%` }} />
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

      {(show.activity?.length ?? 0) > 0 ? (
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
                ? "Search name, who, or MHz…"
                : "Search name or MHz…"
            }
            inputMode="search"
            autoComplete="off"
          />
        </label>
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

      {toolsOpen ? (
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

              <div className="tools-grid">
                <label className="field">
                  <span>Import Workbench CSV</span>
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    disabled={importBusy}
                    onChange={(e) =>
                      void onPickImport(e.target.files?.[0] ?? null)
                    }
                  />
                  <span className="field-note">
                    Preview first — confirm before replacing the board.
                  </span>
                </label>

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
                          <span>{r.frequencyMhz.toFixed(3)} MHz</span>
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
                        onClick={() => setImportPreview(null)}
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

                {features.rooms ? (
                  <label className="field">
                    <span>Rooms (one per line)</span>
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
                  </label>
                ) : null}
              </div>
              {importMsg ? <p className="form-hint">{importMsg}</p> : null}
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

      {features.groups &&
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

      {filterOptions.length > 1 ? (
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

      {admin && features.status && visibleWithRoomFocus.length > 0 ? (
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

      {visibleWithRoomFocus.length === 0 ? (
        <div className="empty">
          {show.channels.length === 0
            ? "No channels yet. Coordinators: open Tools to import a Workbench CSV or add channels by hand."
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
                    admin={admin}
                    features={features}
                    highlighted={highlightId === channel.id}
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

      {features.assignments && assigneeNames.length > 0 ? (
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
  admin,
  features,
  highlighted,
  conflicted,
  onPatch,
}: {
  channel: Channel;
  rooms: string[];
  admin: boolean;
  features: ShowFeatures;
  highlighted?: boolean;
  conflicted?: boolean;
  onPatch: (
    id: string,
    patch: Partial<{
      status: ChannelStatus;
      deployed: boolean;
      roomName: string | null;
      groupName: string | null;
      assignedTo: string | null;
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
      className={`channel-row status-${channel.status}${channel.deployed ? " is-deployed" : ""}${deployLocked ? " is-locked" : ""}${highlighted ? " is-highlight" : ""}${conflicted ? " is-conflict" : ""}`}
    >
      <div className="channel-top-row">
        <div className="channel-main">
          <div className="channel-title">
            <strong>{channel.name}</strong>
            <span className="freq">{channel.frequencyMhz.toFixed(3)} MHz</span>
          </div>
          {features.assignments && channel.assignedTo ? (
            <p className="channel-who">{channel.assignedTo}</p>
          ) : null}
          <div className="channel-meta">
            {channel.band ? <span>{channel.band}</span> : null}
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
