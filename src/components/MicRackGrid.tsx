"use client";

import { useEffect, useMemo, useState } from "react";
import { channelsByRackSlot } from "@/lib/rack";
import type { Channel, MicKind, ShowFeatures } from "@/lib/types";
import { formatRackSlot, micKindLabel, rackSlotCount } from "@/lib/types";

type Patch = Partial<{
  assignedTo: string | null;
  inUse: boolean;
  micKind: MicKind | null;
  name: string;
}>;

export function MicRackGrid({
  channels,
  rackCols,
  rackRows,
  features,
  admin,
  assigneeNames,
  search,
  filterInUse,
  filterWho,
  onPatch,
  onFillEmpty,
  fillBusy,
}: {
  channels: Channel[];
  rackCols: number;
  rackRows: number;
  features: ShowFeatures;
  admin: boolean;
  assigneeNames: string[];
  search: string;
  filterInUse: "all" | "inuse" | "spare";
  filterWho?: "all" | "assigned" | "unassigned";
  onPatch: (id: string, patch: Patch) => Promise<void>;
  onFillEmpty?: () => Promise<void>;
  fillBusy?: boolean;
}) {
  const size = rackSlotCount({ rackCols, rackRows });
  const bySlot = useMemo(
    () => channelsByRackSlot(channels, size),
    [channels, size],
  );

  const slots = useMemo(() => {
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
  }, [bySlot, size, search, filterInUse, filterWho]);

  const emptyCount = size - bySlot.size;
  const inUseCount = channels.filter((c) => c.inUse).length;

  return (
    <div className="mic-rack">
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
        className="mic-rack-grid"
        style={{ ["--rack-cols" as string]: String(rackCols) }}
        role="list"
        aria-label={`${rackCols} by ${rackRows} mic rack`}
      >
        {slots.map(({ slot, channel }) => (
          <RackCell
            key={slot}
            slot={slot}
            channel={channel}
            features={features}
            admin={admin}
            frozen={features.crewLocked && !admin}
            assigneeNames={assigneeNames}
            onPatch={onPatch}
          />
        ))}
      </div>

      {assigneeNames.length > 0 ? (
        <datalist id="assignee-options">
          {assigneeNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function RackCell({
  slot,
  channel,
  features,
  admin,
  frozen,
  assigneeNames,
  onPatch,
}: {
  slot: number;
  channel: Channel | null;
  features: ShowFeatures;
  admin: boolean;
  frozen: boolean;
  assigneeNames: string[];
  onPatch: (id: string, patch: Patch) => Promise<void>;
}) {
  const [whoDraft, setWhoDraft] = useState(channel?.assignedTo ?? "");
  const [nameDraft, setNameDraft] = useState(channel?.name ?? "");

  useEffect(() => {
    setWhoDraft(channel?.assignedTo ?? "");
  }, [channel?.assignedTo, channel?.id]);

  useEffect(() => {
    setNameDraft(channel?.name ?? "");
  }, [channel?.name, channel?.id]);

  if (!channel) {
    return (
      <div className="rack-cell is-empty" role="listitem">
        <span className="rack-ch">CH {formatRackSlot(slot)}</span>
        <span className="rack-empty-label">Empty</span>
      </div>
    );
  }

  const headline =
    channel.assignedTo && channel.name
      ? `${channel.assignedTo} · ${channel.name}`
      : channel.name;

  function setKind(kind: MicKind) {
    if (frozen || !features.assignments) return;
    // Tap again to clear.
    void onPatch(channel!.id, {
      micKind: channel!.micKind === kind ? null : kind,
    });
  }

  return (
    <div
      id={`ch-${channel.id}`}
      className={`rack-cell${channel.inUse ? " is-inuse" : " is-spare"}${channel.assignedTo ? " has-who" : ""}${channel.micKind ? ` kind-${channel.micKind}` : ""}`}
      role="listitem"
    >
      <div className="rack-cell-top">
        <span className="rack-ch">CH {formatRackSlot(slot)}</span>
        <button
          type="button"
          className={`rack-use-btn${channel.inUse ? " on" : ""}`}
          disabled={frozen || !features.assignments}
          aria-pressed={channel.inUse}
          onClick={() => void onPatch(channel.id, { inUse: !channel.inUse })}
        >
          {channel.inUse ? "In use" : "Not in use"}
        </button>
      </div>

      <p className="rack-headline">{headline}</p>

      <div className="rack-kind-row" role="group" aria-label="Mic type">
        <button
          type="button"
          className={`rack-kind-btn${channel.micKind === "handheld" ? " on" : ""}`}
          disabled={frozen || !features.assignments}
          aria-pressed={channel.micKind === "handheld"}
          onClick={() => setKind("handheld")}
        >
          Handheld
        </button>
        <button
          type="button"
          className={`rack-kind-btn${channel.micKind === "lav" ? " on" : ""}`}
          disabled={frozen || !features.assignments}
          aria-pressed={channel.micKind === "lav"}
          onClick={() => setKind("lav")}
        >
          Lav
        </button>
      </div>

      {admin ? (
        <label className="rack-field">
          <span className="sr-only">Mic name</span>
          <input
            value={nameDraft}
            disabled={frozen}
            placeholder={
              channel.micKind
                ? `${micKindLabel(channel.micKind)} ${slot}`
                : "Handheld 3"
            }
            maxLength={80}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const name = nameDraft.trim();
              if (!name || name === channel.name) return;
              void onPatch(channel.id, { name });
            }}
          />
        </label>
      ) : (
        <p className="rack-mic-name">{channel.name}</p>
      )}

      <label className={`rack-field${frozen ? " disabled" : ""}`}>
        <span>Who</span>
        {assigneeNames.length > 0 ? (
          <select
            className="rack-drop-select"
            value=""
            disabled={frozen || !features.assignments}
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
          disabled={frozen || !features.assignments}
          placeholder="e.g. Bradd"
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

      {channel.frequencyMhz > 0 ? (
        <span className="rack-freq">{channel.frequencyMhz.toFixed(3)} MHz</span>
      ) : null}
    </div>
  );
}
