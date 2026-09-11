/** Phone board chrome icons — Lucide 24 grid, stroke 2 (Open Design / svg-design). */

import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function ChromeIcon({
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Share / send link — three connected nodes. */
export function ShareIcon({ className }: IconProps = {}) {
  return (
    <ChromeIcon className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.82 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </ChromeIcon>
  );
}

/** Search channels. */
export function SearchIcon({ className }: IconProps = {}) {
  return (
    <ChromeIcon className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </ChromeIcon>
  );
}

/** Coordinator tools — sliders, not a padlock-looking mark. */
export function GearIcon({ className }: IconProps = {}) {
  return (
    <ChromeIcon className={className}>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </ChromeIcon>
  );
}

/**
 * Keep screen on — phone with a lit face.
 * Avoids “lock” metaphor (Wake Lock API naming confused the old control).
 */
export function KeepAwakeIcon({
  active = false,
  className,
}: IconProps & { active?: boolean }) {
  return (
    <ChromeIcon
      className={`wake-lock-icon${active ? " is-on" : ""}${className ? ` ${className}` : ""}`}
    >
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 19h2" />
      <circle cx="12" cy="10" r="2.5" className="wake-lock-core" />
      <path
        className="wake-lock-rays"
        d="M12 5v1.25M12 13.75V15M7.75 10H9M15 10h1.25M8.8 6.8l.9.9M14.3 12.3l.9.9M14.3 6.8l-.9.9M8.8 12.3l-.9.9"
      />
    </ChromeIcon>
  );
}

/** Undo last Tools edit. */
export function UndoIcon({ className }: IconProps = {}) {
  return (
    <ChromeIcon className={className}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
    </ChromeIcon>
  );
}

/** Link copied. */
export function CheckIcon({ className }: IconProps = {}) {
  return (
    <ChromeIcon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </ChromeIcon>
  );
}
