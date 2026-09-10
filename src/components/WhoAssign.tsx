"use client";

import { useMemo, useState } from "react";

type WhoAssignProps = {
  value: string | null;
  names: string[];
  disabled?: boolean;
  onAssign: (name: string | null) => void;
  /** Slightly denser chips for rack cells */
  compact?: boolean;
};

export function WhoAssign({
  value,
  names,
  disabled = false,
  onAssign,
  compact = false,
}: WhoAssignProps) {
  const [draft, setDraft] = useState("");

  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    if (value?.trim()) {
      const key = value.trim().toLowerCase();
      if (!seen.has(key)) out.unshift(value.trim());
    }
    return out;
  }, [names, value]);

  function submitNew() {
    const name = draft.trim();
    if (!name || disabled) return;
    onAssign(name);
    setDraft("");
  }

  return (
    <div
      className={`who-assign${compact ? " who-assign--compact" : ""}${disabled ? " disabled" : ""}`}
    >
      <span className="who-assign-label">Who</span>
      {list.length > 0 ? (
        <div
          className="who-assign-names"
          role="listbox"
          aria-label="Who names"
        >
          {list.map((name) => {
            const active = (value ?? "").trim() === name;
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={active}
                className={`who-name${active ? " active" : ""}`}
                disabled={disabled}
                onClick={() => onAssign(active ? null : name)}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="who-assign-empty">No names yet — add one below</p>
      )}
      <div className="who-assign-add">
        <input
          value={draft}
          disabled={disabled}
          placeholder="Add name…"
          maxLength={80}
          autoComplete="off"
          aria-label="Add who name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitNew();
            }
          }}
        />
        <button
          type="button"
          className="chip who-add-btn"
          disabled={disabled || !draft.trim()}
          onClick={submitNew}
        >
          Add
        </button>
      </div>
    </div>
  );
}
