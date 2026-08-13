"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
  const [password, setPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [roomsText, setRoomsText] = useState(
    initialShow.rooms.map((r) => r.name).join("\n"),
  );
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/shows/${token}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setShow(data.show);
    setAdmin(data.admin);
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => {
        void refresh();
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
      if (filter === "allowed") return c.status === "allowed";
      if (filter === "blocked") return c.status === "blocked";
      if (filter === "deployed") return c.deployed;
      if (filter === "open") return !c.deployed && c.status !== "blocked";
      return true;
    });
  }, [show.channels, filter]);

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
    setRoomsText(data.show.rooms.map((r: { name: string }) => r.name).join("\n"));
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="board">
      <header className="board-header">
        <div>
          <p className="brand-mark">RF-Orca</p>
          <h1>{show.name}</h1>
          <p className="board-sub">
            Mark view — check deployed frequencies and set the room.
            {show.storageMode === "memory" ? (
              <span className="demo-pill"> Demo storage (resets on cold start)</span>
            ) : null}
          </p>
        </div>
        <div className="board-actions">
          <button type="button" className="btn-ghost" onClick={() => void copyLink()}>
            {copied ? "Copied" : "Copy link"}
          </button>
          {admin ? (
            <button type="button" className="btn-ghost" onClick={() => void lock()}>
              Lock admin
            </button>
          ) : null}
        </div>
      </header>

      {!admin ? (
        <form className="admin-unlock" onSubmit={(e) => void unlock(e)}>
          <p>Coordinator? Unlock to import and set allowed / blocked.</p>
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
        <section className="admin-panel">
          <h2>Admin</h2>
          <div className="admin-grid">
            <label className="field">
              <span>Import Shure Workbench CSV</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => void onImport(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="field">
              <span>Rooms (one per line)</span>
              <textarea
                rows={4}
                value={roomsText}
                onChange={(e) => setRoomsText(e.target.value)}
                placeholder={"Ballroom A\nGreen Room\nStage"}
              />
              <button type="button" className="btn-secondary" onClick={() => void saveRooms()}>
                Save rooms
              </button>
            </label>
          </div>
          {importMsg ? <p className="form-hint">{importMsg}</p> : null}
        </section>
      )}

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

      {visible.length === 0 ? (
        <div className="empty">
          {show.channels.length === 0
            ? admin
              ? "Import a WWB CSV to populate channels."
              : "No channels yet. Ask the coordinator to unlock and import a Workbench CSV."
            : "Nothing matches this filter."}
        </div>
      ) : (
        <ul className="channel-list">
          {visible.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              rooms={show.rooms.map((r) => r.name)}
              admin={admin}
              onPatch={patchChannel}
            />
          ))}
        </ul>
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
    }>,
  ) => Promise<void>;
}) {
  const blocked = channel.status === "blocked";
  const [roomDraft, setRoomDraft] = useState(channel.roomName ?? "");

  useEffect(() => {
    setRoomDraft(channel.roomName ?? "");
  }, [channel.roomName]);

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
          {channel.zone ? <span>{channel.zone}</span> : null}
          {channel.isBackup ? <span className="tag">Backup</span> : null}
          <span className={`tag status-${channel.status}`}>{channel.status}</span>
        </div>
      </div>

      {admin ? (
        <div className="status-controls">
          {(["allowed", "blocked", "unreviewed"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={channel.status === status ? "chip active" : "chip"}
              onClick={() => void onPatch(channel.id, { status })}
            >
              {status}
            </button>
          ))}
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
