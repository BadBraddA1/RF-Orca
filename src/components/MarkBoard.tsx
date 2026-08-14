"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import type { Channel, ChannelStatus, ShowPublic } from "@/lib/types";

type Filter = "all" | "allowed" | "blocked" | "deployed" | "open";

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
  const [, startTransition] = useTransition();

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
    const fromShow = show.groups.map((g) => g.name);
    const fromChannels = show.channels
      .map((c) => c.groupName)
      .filter((n): n is string => Boolean(n));
    return [...new Set([...fromShow, ...fromChannels])];
  }, [show.groups, show.channels]);

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
      if (groupFilter !== "all") {
        if (groupFilter === "__ungrouped__") {
          if (c.groupName) return false;
        } else if (c.groupName !== groupFilter) {
          return false;
        }
      }
      if (filter === "allowed") return c.status === "allowed";
      if (filter === "blocked") return c.status === "blocked";
      if (filter === "deployed") return c.deployed;
      if (filter === "open") return !c.deployed && c.status !== "blocked";
      return true;
    });
  }, [show.channels, filter, groupFilter]);

  const sections = useMemo(() => {
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
    // Any unexpected keys (shouldn't happen) last
    for (const key of map.keys()) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }
    return orderedKeys.map((name) => ({ name, channels: map.get(name)! }));
  }, [visible, groupNames]);

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

  async function lock() {
    await fetch(`/api/shows/${token}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    });
    setAdmin(false);
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
        groupName: manualGroup.trim() || null,
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
    if (!admin || ids.length === 0 || bulkBusy) return;
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

  return (
    <div className="board">
      <header className="board-header">
        <div>
          <BrandLockup size="header" showTagline />
          <h1>{show.name}</h1>
          <p className="board-sub">
            Mark what’s deployed and which room.
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
                <button type="button" className="btn-quiet" onClick={() => void lock()}>
                  Lock
                </button>
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
                    Zones from WWB become channel groups when present.
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
                  <input
                    value={manualGroup}
                    onChange={(e) => setManualGroup(e.target.value)}
                    placeholder="Group (optional) — e.g. Vocals"
                    list="channel-group-options"
                  />
                  <button type="submit" className="btn-secondary">
                    Add channel
                  </button>
                </form>

                <label className="field">
                  <span>Channel groups (one per line)</span>
                  <textarea
                    rows={3}
                    value={groupsText}
                    onChange={(e) => setGroupsText(e.target.value)}
                    placeholder={"Vocals\nIEMs\nComms"}
                  />
                  <button type="button" className="btn-secondary" onClick={() => void saveGroups()}>
                    Save groups
                  </button>
                </label>

                <label className="field">
                  <span>Rooms (one per line)</span>
                  <textarea
                    rows={3}
                    value={roomsText}
                    onChange={(e) => setRoomsText(e.target.value)}
                    placeholder={"Ballroom A\nGreen Room"}
                  />
                  <button type="button" className="btn-secondary" onClick={() => void saveRooms()}>
                    Save rooms
                  </button>
                </label>
              </div>
              {importMsg ? <p className="form-hint">{importMsg}</p> : null}
            </div>
          )}
        </aside>
      ) : null}

      <datalist id="channel-group-options">
        {groupNames.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {groupNames.length > 0 || show.channels.some((c) => !c.groupName) ? (
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
            className={groupFilter === "__ungrouped__" ? "filter active" : "filter"}
            onClick={() => setGroupFilter("__ungrouped__")}
          >
            Ungrouped
          </button>
        </div>
      ) : null}

      <div className="filters">
        {(
          [
            ["all", `All (${counts.all})`],
            ["open", `Open (${counts.open})`],
            ["deployed", `Deployed (${counts.deployed})`],
            ["allowed", `Allowed (${counts.allowed})`],
            ["blocked", `Blocked (${counts.blocked})`],
          ] as const
        ).map(([key, label]) => (
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

      {admin && visible.length > 0 ? (
        <div className="bulk-bar" role="group" aria-label="Bulk status for visible channels">
          <span className="bulk-label">
            Set {visible.length} visible →
          </span>
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
            <section key={section.name} className="group-section">
              <div className="group-heading-row">
                <h2 className="group-heading">
                  {section.name}
                  <span className="group-count">{section.channels.length}</span>
                </h2>
                {admin ? (
                  <div className="bulk-inline" role="group" aria-label={`Bulk status for ${section.name}`}>
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
              <ul className="channel-list">
                {section.channels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    rooms={show.rooms.map((r) => r.name)}
                    admin={admin}
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
  onPatch,
}: {
  channel: Channel;
  rooms: string[];
  admin: boolean;
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
  const blocked = channel.status === "blocked";
  const [roomDraft, setRoomDraft] = useState(channel.roomName ?? "");
  const [groupDraft, setGroupDraft] = useState(channel.groupName ?? "");

  useEffect(() => {
    setRoomDraft(channel.roomName ?? "");
  }, [channel.roomName]);

  useEffect(() => {
    setGroupDraft(channel.groupName ?? "");
  }, [channel.groupName]);

  return (
    <li className={`channel-row status-${channel.status}${channel.deployed ? " is-deployed" : ""}`}>
      <div className="channel-main">
        <div className="channel-title">
          <strong>{channel.name}</strong>
          <span className="freq">{channel.frequencyMhz.toFixed(3)} MHz</span>
        </div>
        <div className="channel-meta">
          {channel.band ? <span>{channel.band}</span> : null}
          {channel.groupChannel ? <span>G/Ch {channel.groupChannel}</span> : null}
          {channel.isBackup ? <span className="tag">Backup</span> : null}
          <span className={`tag status-${channel.status}`}>{channel.status}</span>
        </div>
      </div>

      {admin ? (
        <div className="admin-inline">
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
        </div>
      ) : null}

      <label className={`deploy-check${blocked ? " disabled" : ""}`}>
        <input
          type="checkbox"
          checked={channel.deployed}
          disabled={blocked}
          onChange={(e) => {
            const deployed = e.target.checked;
            if (deployed && !(channel.roomName || roomDraft) && rooms.length === 0) {
              const room = window.prompt("Room deployed in?");
              if (!room) return;
              setRoomDraft(room);
              void onPatch(channel.id, { deployed: true, roomName: room });
              return;
            }
            void onPatch(channel.id, {
              deployed,
              roomName: deployed ? channel.roomName || roomDraft || null : null,
            });
          }}
        />
        <span>I have deployed this frequency</span>
      </label>

      <label className="room-field">
        <span>Room</span>
        {rooms.length > 0 ? (
          <select
            value={channel.roomName ?? ""}
            disabled={blocked}
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
            disabled={blocked}
            placeholder="e.g. Ballroom A"
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
    </li>
  );
}
