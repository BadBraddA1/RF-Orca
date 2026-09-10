"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type WhoAssignProps = {
  value: string | null;
  names: string[];
  disabled?: boolean;
  onAssign: (name: string | null) => void;
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

export function WhoAssign({
  value,
  names,
  disabled = false,
  onAssign,
  compact = false,
}: WhoAssignProps) {
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

  const menu =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            className="who-menu who-menu--portal"
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`who-assign room-field${compact ? " who-assign--compact" : ""}${disabled ? " disabled" : ""}`}
    >
      <span className="who-assign-label">Who</span>
      <button
        ref={triggerRef}
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
      {menu}
    </div>
  );
}
