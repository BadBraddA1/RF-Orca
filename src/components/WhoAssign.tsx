"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ChoiceMenuProps = {
  label: string;
  value: string | null;
  options: string[];
  disabled?: boolean;
  emptyLabel?: string;
  addPlaceholder?: string;
  /** Hide the add row (pick-only). Default true. */
  allowAdd?: boolean;
  onPick: (value: string | null) => void;
  /** Slightly denser control for rack cells */
  compact?: boolean;
};

type MenuCoords = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

export function ChoiceMenu({
  label,
  value,
  options,
  disabled = false,
  emptyLabel = "None yet",
  addPlaceholder = "Add…",
  allowAdd = true,
  onPick,
  compact = false,
}: ChoiceMenuProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of options) {
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
  }, [options, value]);

  const display = value?.trim() || emptyLabel;

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const viewportPad = 8;
    const ideal = Math.min(window.innerHeight * 0.55, 18 * 16);
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
    const spaceAbove = rect.top - gap - viewportPad;
    const openUp =
      spaceBelow < Math.min(ideal, 12 * 16) && spaceAbove > spaceBelow;

    if (openUp) {
      setCoords({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight: Math.max(9 * 16, Math.min(ideal, spaceAbove)),
      });
    } else {
      setCoords({
        left: rect.left,
        width: rect.width,
        top: rect.bottom + gap,
        maxHeight: Math.max(9 * 16, Math.min(ideal, spaceBelow)),
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, list.length]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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

  function pick(next: string | null) {
    onPick(next);
    setDraft("");
    setOpen(false);
  }

  function submitNew() {
    const name = draft.trim();
    if (!name || disabled) return;
    onPick(name);
    setDraft("");
    setOpen(false);
  }

  const menu =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            className="pick-menu pick-menu--portal"
            role="presentation"
            style={{
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              top: coords.top,
              bottom: coords.bottom,
            }}
          >
            <div
              id={listId}
              className="pick-menu-list"
              role="listbox"
              aria-label={label}
            >
              <button
                type="button"
                role="option"
                aria-selected={!value?.trim()}
                className={`pick-option${!value?.trim() ? " active" : ""}`}
                onClick={() => pick(null)}
              >
                {emptyLabel}
              </button>
              {list.map((name) => {
                const active = (value ?? "").trim() === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`pick-option${active ? " active" : ""}`}
                    onClick={() => pick(name)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {allowAdd ? (
              <div className="pick-menu-add">
                <input
                  value={draft}
                  disabled={disabled}
                  placeholder={addPlaceholder}
                  maxLength={80}
                  autoComplete="off"
                  aria-label={addPlaceholder}
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
                  className="chip pick-add-btn"
                  disabled={disabled || !draft.trim()}
                  onClick={submitNew}
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`pick-field room-field${compact ? " pick-field--compact" : ""}${disabled ? " disabled" : ""}`}
    >
      <span className="pick-field-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="pick-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className={value?.trim() ? undefined : "pick-trigger-placeholder"}>
          {display}
        </span>
      </button>
      {menu}
    </div>
  );
}

/** Who assignment — same ChoiceMenu chrome. */
export function WhoAssign({
  value,
  names,
  disabled,
  onAssign,
  compact,
}: {
  value: string | null;
  names: string[];
  disabled?: boolean;
  onAssign: (name: string | null) => void;
  compact?: boolean;
}) {
  return (
    <ChoiceMenu
      label="Who"
      value={value}
      options={names}
      disabled={disabled}
      emptyLabel="No who yet"
      addPlaceholder="Add name…"
      onPick={onAssign}
      compact={compact}
    />
  );
}

/** Stage / deploy room — same ChoiceMenu chrome as Who. */
export function RoomAssign({
  value,
  rooms,
  disabled,
  label = "Stage room",
  onAssign,
  compact,
}: {
  value: string | null;
  rooms: string[];
  disabled?: boolean;
  label?: string;
  onAssign: (room: string | null) => void;
  compact?: boolean;
}) {
  return (
    <ChoiceMenu
      label={label}
      value={value}
      options={rooms}
      disabled={disabled}
      emptyLabel="No room yet"
      addPlaceholder="Add room…"
      onPick={onAssign}
      compact={compact}
    />
  );
}
