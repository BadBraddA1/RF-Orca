"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import type {
  Channel,
  ChannelStatus,
  ShowFeatures,
  ShowPublic,
} from "@/lib/types";

type Filter = "all" | "allowed" | "blocked" | "deployed" | "open";

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
    hint: "Crew can’t undo or change room once Deployed (you still can)",
  },
  {
    key: "crewLocked",
    label: "Lock board for crew",
    hint: "Freeze all crew marking — read-only until you unlock",
  },
];

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
  const [manualName, setManualName] = useState("");
  const [manualFreq, setManualFreq] = useState("");
  const [manualGroup, setManualGroup] = useState("");
  const [copied, setCopied] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [, startTransition] = useTransition();

  const features = show.features;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/shows/${token}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setShow(data.show);
    setAdmin(data.admin);
    setRoomsText(
      (data.show.rooms as { name: string }[]).map((r) => r.name).join("\n"),
    );
    setGroupsText(
      (data.show.groups as { name: string }[]).map((g) => g.name).join("\n"),
    );
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => {
        void refresh();
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
      open: channels.filter((c) => !c.deployed && c.status !== "blocked").length,
    };
  }, [show.channels]);

  const visible = useMemo(() => {
    return show.channels.filter((c) => {
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
      return true;
    });
  }, [show.channels, filter, groupFilter, features]);

  const sections = useMemo(() => {
    if (!features.groups) {
      return [{ name: "", channels: visible }];
    }
    const map = new Map<string, Channel[]>();
    for (const ch of visible) {
      const key = ch.groupName?.trim() || "Ungrouped";
      const list = map.get(key) ?? [];
      list.push(ch);
      map.set(key, list);
    }
    const orderedKeys = [
      ...groupNames.filter((g) => map.has(g)),
      ...(map.has("Ungrouped") ? ["Ungrouped"] : []),
    ];
    for (const key of map.keys()) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }
    return orderedKeys.map((name) => ({ name, channels: map.get(name)! }));
  }, [visible, groupNames, features.groups]);

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
      setShow(data.show);
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
    }>,
  ) {
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
    setShow(data.show);
    setGroupsText(
      (data.show.groups as { name: string }[]).map((g) => g.name).join("\n"),
    );
  }

  async function onImport(file: File | null) {
    if (!file) return;
    setImportMsg(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/shows/${token}/import`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(data.error || "Import failed");
      return;
    }
    setShow(data.show);
    setGroupsText(
      (data.show.groups as { name: string }[]).map((g) => g.name).join("\n"),
    );
    const warn =
      data.warnings?.length > 0 ? ` Warnings: ${data.warnings.join(" ")}` : "";
    setImportMsg(`Imported ${data.imported} channels.${warn}`);
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
    setShow(data.show);
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
    setShow(data.show);
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
    setShow(data.show);
    setGroupsText(
      (data.show.groups as { name: string }[]).map((g) => g.name).join("\n"),
    );
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
      setShow(data.show);
    } finally {
      setBulkBusy(false);
    }
  }

  const filterOptions = (
    [
      ["all", `All (${counts.all})`],
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

  const boardSub = (() => {
    const bits: string[] = [];
    if (features.deploy) bits.push("Tap Deploy");
    if (features.rooms) bits.push("set the room");
    if (bits.length === 0) return "Frequency board.";
    return `${bits.join(", ")}.`;
  })();

  return (
    <div className="board">
      <header className="board-header">
        <div>
          <BrandLockup size="header" showTagline />
          <h1>{show.name}</h1>
          <p className="board-sub">
            {boardSub}
            {show.storageMode === "memory" ? (
              <span className="demo-pill"> Demo storage</span>
            ) : null}
          </p>
        </div>
        <div className="board-actions">
          <button type="button" className="btn-ghost" onClick={() => void copyLink()}>
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

      {features.crewLocked ? (
        <div className="board-banner locked" role="status">
          Board locked for crew — marking paused.
          {admin ? " You can still edit while Tools are unlocked." : null}
        </div>
      ) : null}

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
                <p className="tools-whisper">Show options — use only what you need</p>
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
                    onChange={(e) => void onImport(e.target.files?.[0] ?? null)}
                  />
                  <span className="field-note">
                    Zones from WWB become channel groups when groups are on.
                  </span>
                </label>

                <form className="field manual-add" onSubmit={(e) => void addManual(e)}>
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
                      placeholder="Group (optional) — e.g. Vocals"
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

      {admin && features.status && visible.length > 0 ? (
        <div
          className="bulk-bar"
          role="group"
          aria-label="Bulk status for visible channels"
        >
          <span className="bulk-label">Set {visible.length} visible →</span>
          <button
            type="button"
            className="chip"
            disabled={bulkBusy}
            onClick={() => void bulkStatus(visible.map((c) => c.id), "allowed")}
          >
            Allowed
          </button>
          <button
            type="button"
            className="chip"
            disabled={bulkBusy}
            onClick={() => void bulkStatus(visible.map((c) => c.id), "blocked")}
          >
            Blocked
          </button>
          <button
            type="button"
            className="chip"
            disabled={bulkBusy}
            onClick={() =>
              void bulkStatus(visible.map((c) => c.id), "unreviewed")
            }
          >
            Unreviewed
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty">
          {show.channels.length === 0
            ? "No channels yet. Coordinators: open Tools to import a Workbench CSV or add channels by hand."
            : "Nothing matches this filter."}
        </div>
      ) : (
        <div className="group-sections">
          {sections.map((section) => (
            <section
              key={section.name || "all"}
              className="group-section"
            >
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
                    onPatch={patchChannel}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  rooms,
  admin,
  features,
  onPatch,
}: {
  channel: Channel;
  rooms: string[];
  admin: boolean;
  features: ShowFeatures;
  onPatch: (
    id: string,
    patch: Partial<{
      status: ChannelStatus;
      deployed: boolean;
      roomName: string | null;
      groupName: string | null;
    }>,
  ) => Promise<void>;
}) {
  const blocked = features.status && channel.status === "blocked";
  const crewFrozen = features.crewLocked && !admin;
  const deployLocked =
    features.lockDeployed && channel.deployed && !admin;
  const markDisabled = blocked || crewFrozen || deployLocked;
  const [roomDraft, setRoomDraft] = useState(channel.roomName ?? "");
  const [groupDraft, setGroupDraft] = useState(channel.groupName ?? "");

  useEffect(() => {
    setRoomDraft(channel.roomName ?? "");
  }, [channel.roomName]);

  useEffect(() => {
    setGroupDraft(channel.groupName ?? "");
  }, [channel.groupName]);

  return (
    <li
      className={`channel-row status-${channel.status}${channel.deployed ? " is-deployed" : ""}${deployLocked ? " is-locked" : ""}`}
    >
      <div className="channel-top-row">
        <div className="channel-main">
          <div className="channel-title">
            <strong>{channel.name}</strong>
            <span className="freq">{channel.frequencyMhz.toFixed(3)} MHz</span>
          </div>
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
            {deployLocked ? <span className="tag locked-tag">Locked</span> : null}
          </div>
        </div>

        {features.deploy ? (
          <button
            type="button"
            className={`deploy-btn${channel.deployed ? " on" : ""}${markDisabled ? " disabled" : ""}`}
            disabled={markDisabled}
            aria-pressed={channel.deployed}
            title={
              deployLocked
                ? "Locked after deploy — coordinator can unlock"
                : crewFrozen
                  ? "Board locked for crew"
                  : undefined
            }
            onClick={() => {
              if (markDisabled) return;
              if (channel.deployed) {
                void onPatch(channel.id, { deployed: false, roomName: null });
                return;
              }
              if (!features.rooms) {
                void onPatch(channel.id, { deployed: true, roomName: null });
                return;
              }
              const roomName = channel.roomName || roomDraft.trim() || null;
              if (!roomName && rooms.length === 0) {
                const room = window.prompt("Room?");
                if (!room?.trim()) return;
                setRoomDraft(room.trim());
                void onPatch(channel.id, {
                  deployed: true,
                  roomName: room.trim(),
                });
                return;
              }
              void onPatch(channel.id, {
                deployed: true,
                roomName: roomName || (rooms[0] ?? null),
              });
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

      {features.rooms ? (
        <label
          className={`room-field${markDisabled ? " disabled" : ""}`}
        >
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
    </li>
  );
}
