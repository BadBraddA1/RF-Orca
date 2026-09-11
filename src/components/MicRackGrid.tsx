"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { WhoAssign } from "@/components/WhoAssign";
import { channelsByRackSlot } from "@/lib/rack";
import { crewGridCols } from "@/lib/crew-draw";
import type { Channel, MicKind, ShowFeatures } from "@/lib/types";
import { formatRackSlot, micKindLabel, rackSlotCount } from "@/lib/types";

type Patch = Partial<{
  assignedTo: string | null;
  inUse: boolean;
  micKind: MicKind | null;
  name: string;
  deployed: boolean;
  roomName: string | null;
}>;

export function MicRackGrid({
  channels,
  rackCols,
  rackRows,
  features,
  admin,
  elevated,
  assigneeNames,
  search,
  filterInUse,
  filterWho,
  flashIds,
  lastChangeIds,
  mode = "physical",
  roomName = null,
  onChangeRoom,
  onPatch,
  onFillEmpty,
  fillBusy,
  /** Audio Crew: lock column count so draw marks land on the same channel everywhere. */
  crewSynced = false,
}: {
  channels: Channel[];
  rackCols: number;
  rackRows: number;
  features: ShowFeatures;
  admin: boolean;
  /** Admin or BO Lead — can undeploy / mark through locks. */
  elevated?: boolean;
  assigneeNames: string[];
  search: string;
  filterInUse: "all" | "inuse" | "spare";
  filterWho?: "all" | "assigned" | "unassigned";
  flashIds?: Record<string, number>;
  lastChangeIds?: string[];
  /** physical = full rack map; room = gear staged/deployed in one room */
  mode?: "physical" | "room";
  roomName?: string | null;
  onChangeRoom?: () => void;
  onPatch: (id: string, patch: Patch) => Promise<void>;
  onFillEmpty?: () => Promise<void>;
  fillBusy?: boolean;
  crewSynced?: boolean;
}) {
  const canMark = elevated ?? admin;
  const size = rackSlotCount({ rackCols, rackRows });
  const bySlot = useMemo(
    () => channelsByRackSlot(channels, size),
    [channels, size],
  );

  const roomChannels = useMemo(() => {
    if (mode !== "room" || !roomName) return [];
    const needle = search.trim().toLowerCase();
    const whoFilter = filterWho ?? "all";
    return channels
      .filter((c) => (c.roomName ?? "").trim() === roomName)
      .filter((c) => {
        if (filterInUse === "inuse" && !c.inUse) return false;
        if (filterInUse === "spare" && c.inUse) return false;
        if (whoFilter === "assigned" && !c.assignedTo?.trim()) return false;
        if (whoFilter === "unassigned" && c.assignedTo?.trim()) return false;
        if (!needle) return true;
        const hay = [
          c.name,
          c.assignedTo,
          c.micKind,
          c.rackSlot != null ? formatRackSlot(c.rackSlot) : "",
          c.frequencyMhz > 0 ? c.frequencyMhz.toFixed(3) : "",
          c.band,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        const sa = a.rackSlot ?? 9999;
        const sb = b.rackSlot ?? 9999;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
  }, [
    mode,
    roomName,
    channels,
    search,
    filterInUse,
    filterWho,
  ]);

  const slots = useMemo(() => {
    if (mode === "room") return [];
    const needle = search.trim().toLowerCase();
    const whoFilter = filterWho ?? "all";
    const list: { slot: number; channel: Channel | null }[] = [];
    for (let slot = 1; slot <= size; slot += 1) {
      const channel = bySlot.get(slot) ?? null;
      if (filterInUse === "inuse" && (!channel || !channel.inUse)) continue;
      if (filterInUse === "spare" && channel?.inUse) continue;
      if (whoFilter === "assigned" && !channel?.assignedTo?.trim()) continue;
      if (whoFilter === "unassigned" && channel?.assignedTo?.trim()) continue;
      if (needle && channel) {
        const hay = [
          channel.name,
          channel.assignedTo,
          channel.micKind,
          formatRackSlot(slot),
          channel.frequencyMhz > 0 ? channel.frequencyMhz.toFixed(3) : "",
          channel.band,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      } else if (needle && !channel) {
        continue;
      }
      list.push({ slot, channel });
    }
    return list;
  }, [mode, bySlot, size, search, filterInUse, filterWho]);

  const emptyCount = size - bySlot.size;
  const inUseCount =
    mode === "room"
      ? roomChannels.filter((c) => c.inUse).length
      : channels.filter((c) => c.inUse).length;
  const deployedCount =
    mode === "room" ? roomChannels.filter((c) => c.deployed).length : 0;

  if (mode === "room") {
    const roomCols = crewGridCols(roomChannels.length);
    return (
      <div
        className="mic-rack mic-rack--room mic-rack-draw-host"
        data-crew-draw-host=""
      >
        <div className="mic-rack-draw-plane" data-crew-draw-plane="">
          <div className="mic-rack-hud" role="status">
            <div className="mic-rack-hud-main">
              <strong>{roomName}</strong>
              <span>
                {roomChannels.length} gear
                {features.deploy ? ` · ${deployedCount} deployed` : ""}
                {features.assignments ? ` · ${inUseCount} in use` : ""}
              </span>
            </div>
            {onChangeRoom ? (
              <button type="button" className="chip" onClick={onChangeRoom}>
                Change room
              </button>
            ) : null}
          </div>

          {roomChannels.length === 0 ? (
            <div className="empty">
              Nothing staged or deployed in {roomName} yet.
              {admin
                ? " Stage channels to this room from List, then come back."
                : ""}
            </div>
          ) : (
            <div
              className={`mic-rack-grid mic-rack-grid--room${crewSynced ? " mic-rack-grid--crew" : ""}`}
              role="list"
              aria-label={`Gear in ${roomName}`}
              data-crew-grid=""
              data-crew-cols={String(roomCols)}
              data-crew-count={String(roomChannels.length)}
              data-crew-room={roomName ?? ""}
              style={
                crewSynced
                  ? ({ ["--crew-cols"]: String(roomCols) } as CSSProperties)
                  : undefined
              }
            >
              {roomChannels.map((channel, index) => (
                <RackCell
                  key={channel.id}
                  slot={channel.rackSlot ?? 0}
                  channel={channel}
                  features={features}
                  admin={admin}
                  elevated={canMark}
                  frozen={features.crewLocked && !canMark}
                  assigneeNames={assigneeNames}
                  roomMode
                  crewIndex={index}
                  flashing={Boolean(flashIds?.[channel.id])}
                  lastChanged={Boolean(lastChangeIds?.includes(channel.id))}
                  onPatch={onPatch}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mic-rack mic-rack-draw-host" data-crew-draw-host="">
      <div className="mic-rack-draw-plane" data-crew-draw-plane="">
        <div className="mic-rack-hud" role="status">
          <strong>
            {rackCols}×{rackRows} · {size} ch · {inUseCount} in use
          </strong>
          {emptyCount > 0 && admin && onFillEmpty ? (
            <button
              type="button"
              className="btn-quiet"
              disabled={fillBusy}
              onClick={() => void onFillEmpty()}
            >
              Fill {emptyCount} empty
            </button>
          ) : emptyCount > 0 ? (
            <span>{emptyCount} empty</span>
          ) : null}
        </div>

        <div
          className={`mic-rack-grid${crewSynced ? " mic-rack-grid--crew" : ""}`}
          style={
            {
              ["--rack-cols"]: String(rackCols),
              ...(crewSynced ? { ["--crew-cols"]: String(rackCols) } : null),
            } as CSSProperties
          }
          role="list"
          aria-label={`${rackCols} by ${rackRows} mic rack`}
          data-crew-grid=""
          data-crew-cols={String(rackCols)}
          data-crew-count={String(size)}
          data-crew-room=""
        >
          {slots.map(({ slot, channel }, index) => (
            <RackCell
              key={slot}
              slot={slot}
              channel={channel}
              features={features}
              admin={admin}
              elevated={canMark}
              frozen={features.crewLocked && !canMark}
              assigneeNames={assigneeNames}
              crewIndex={index}
              flashing={Boolean(channel && flashIds?.[channel.id])}
              lastChanged={Boolean(
                channel && lastChangeIds?.includes(channel.id),
              )}
              onPatch={onPatch}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RackCell({
  slot,
  channel,
  features,
  admin,
  elevated,
  frozen,
  assigneeNames,
  roomMode = false,
  crewIndex,
  flashing,
  lastChanged,
  onPatch,
}: {
  slot: number;
  channel: Channel | null;
  features: ShowFeatures;
  admin: boolean;
  elevated: boolean;
  frozen: boolean;
  assigneeNames: string[];
  roomMode?: boolean;
  crewIndex?: number;
  flashing?: boolean;
  lastChanged?: boolean;
  onPatch: (id: string, patch: Patch) => Promise<void>;
}) {
  const [nameDraft, setNameDraft] = useState(channel?.name ?? "");

  useEffect(() => {
    setNameDraft(channel?.name ?? "");
  }, [channel?.name, channel?.id]);

  if (!channel) {
    return (
      <div
        className="rack-cell is-empty"
        role="listitem"
        data-crew-index={crewIndex != null ? String(crewIndex) : undefined}
      >
        <span className="rack-ch">CH {formatRackSlot(slot)}</span>
        <span className="rack-empty-label">Empty</span>
      </div>
    );
  }

  const ch = channel;
  const headline =
    ch.assignedTo && ch.name
      ? `${ch.assignedTo} · ${ch.name}`
      : ch.name;

  const deployLocked =
    features.lockDeployed && ch.deployed && !elevated;
  const markDisabled =
    frozen ||
    deployLocked ||
    (features.status && ch.status === "blocked");

  function setKind(kind: MicKind) {
    if (frozen || !features.assignments) return;
    void onPatch(ch.id, {
      micKind: ch.micKind === kind ? null : kind,
    });
  }

  return (
    <div
      id={`ch-${ch.id}`}
      className={`rack-cell${ch.inUse ? " is-inuse" : " is-spare"}${ch.assignedTo ? " has-who" : ""}${ch.micKind ? ` kind-${ch.micKind}` : ""}${ch.deployed ? " is-deployed" : ""}${flashing ? " is-flash" : ""}${lastChanged ? " is-last-change" : ""}`}
      role="listitem"
      data-crew-index={crewIndex != null ? String(crewIndex) : undefined}
      data-channel-id={ch.id}
    >
      <div className="rack-cell-top">
        {slot > 0 ? (
          <span className="rack-ch">CH {formatRackSlot(slot)}</span>
        ) : (
          <span className="rack-ch">Mic</span>
        )}
        {features.assignments ? (
          <button
            type="button"
            className={`use-toggle use-toggle--rack${ch.inUse ? " on" : ""}`}
            disabled={frozen}
            aria-pressed={ch.inUse}
            aria-label={ch.inUse ? "Mic in use" : "Mic spare on rack"}
            title={
              ch.inUse
                ? "Mic is on someone — tap to mark spare"
                : "Mic is spare on the rack — tap to mark in use"
            }
            onClick={() => void onPatch(ch.id, { inUse: !ch.inUse })}
          >
            {ch.inUse ? "In use" : "Spare"}
          </button>
        ) : null}
      </div>

      <p className="rack-headline">{headline}</p>

      {features.assignments ? (
        <div className="rack-kind-row" role="group" aria-label="Mic type">
          <button
            type="button"
            className={`rack-kind-btn${ch.micKind === "handheld" ? " on" : ""}`}
            disabled={frozen}
            aria-pressed={ch.micKind === "handheld"}
            onClick={() => setKind("handheld")}
          >
            Handheld
          </button>
          <button
            type="button"
            className={`rack-kind-btn${ch.micKind === "lav" ? " on" : ""}`}
            disabled={frozen}
            aria-pressed={ch.micKind === "lav"}
            onClick={() => setKind("lav")}
          >
            Lav
          </button>
        </div>
      ) : null}

      {admin ? (
        <label className="rack-field">
          <span className="sr-only">Mic name</span>
          <input
            value={nameDraft}
            disabled={frozen}
            placeholder={
              ch.micKind
                ? `${micKindLabel(ch.micKind)} ${slot || ""}`.trim()
                : "Mic name"
            }
            maxLength={80}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const name = nameDraft.trim();
              if (!name || name === ch.name) return;
              void onPatch(ch.id, { name });
            }}
          />
        </label>
      ) : (
        <p className="rack-mic-name">{ch.name}</p>
      )}

      {features.assignments ? (
        <WhoAssign
          compact
          value={ch.assignedTo}
          names={assigneeNames}
          disabled={frozen}
          onAssign={(assignedTo) => {
            void onPatch(ch.id, { assignedTo });
          }}
        />
      ) : null}

      {roomMode && features.deploy ? (
        <button
          type="button"
          className={`deploy-btn${ch.deployed ? " on" : ""}${markDisabled ? " disabled" : ""}`}
          disabled={markDisabled}
          aria-pressed={ch.deployed}
          onClick={() => {
            if (markDisabled) return;
            void onPatch(ch.id, {
              deployed: !ch.deployed,
              roomName: ch.roomName,
            });
          }}
        >
          {ch.deployed ? "Deployed" : "Deploy"}
        </button>
      ) : null}

      {ch.frequencyMhz > 0 || ch.band ? (
        <span className="rack-freq">
          {ch.band ? (
            <span className="rack-band">{ch.band}</span>
          ) : null}
          {ch.frequencyMhz > 0 ? (
            <span>
              {ch.band ? " · " : ""}
              {ch.frequencyMhz.toFixed(3)} MHz
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
