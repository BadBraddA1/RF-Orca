"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type WhoAssignProps = {
  value: string | null;
  names: string[];
  disabled?: boolean;
  onAssign: (name: string | null) => void;
  /** Slightly denser control for rack cells */
  compact?: boolean;
};

export function WhoAssign({
  value,
  names,
  disabled = false,
  onAssign,
  compact = false,
}: WhoAssignProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

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

  const label = value?.trim() || "No who yet";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(name: string | null) {
    onAssign(name);
    setDraft("");
    setOpen(false);
  }

  function submitNew() {
    const name = draft.trim();
    if (!name || disabled) return;
    onAssign(name);
    setDraft("");
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`who-assign room-field${compact ? " who-assign--compact" : ""}${disabled ? " disabled" : ""}`}
    >
      <span className="who-assign-label">Who</span>
      <button
        type="button"
        className="who-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className={value?.trim() ? undefined : "who-trigger-placeholder"}>
          {label}
        </span>
      </button>

      {open ? (
        <div className="who-menu" role="presentation">
          <div
            id={listId}
            className="who-menu-list"
            role="listbox"
            aria-label="Who names"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value?.trim()}
              className={`who-option${!value?.trim() ? " active" : ""}`}
              onClick={() => pick(null)}
            >
              No who yet
            </button>
            {list.map((name) => {
              const active = (value ?? "").trim() === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`who-option${active ? " active" : ""}`}
                  onClick={() => pick(name)}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="who-menu-add">
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
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
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
      ) : null}
    </div>
  );
}
