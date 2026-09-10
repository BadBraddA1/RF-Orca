---
name: RF Orca
description: Crew mark board for live RF — lean, dark, signal-clear under house lights.
colors:
  ink: "#f2f6ff"
  ink-soft: "#c5d2e8"
  navy: "#06101f"
  navy-2: "#0a1a30"
  panel: "#10263f"
  foam: "#0d2038"
  sand: "#0b1728"
  sea: "#1aa7c4"
  sea-bright: "#4ae0f5"
  signal: "#ff7a1a"
  signal-hot: "#ffb060"
  danger: "#ff7a88"
  ok: "#5dffc0"
  ok-ink: "#b8ffe0"
  ok-soft: "#9bffd8"
  danger-ink: "#ffb0b8"
  danger-soft: "#ffd0d5"
  ink-on-signal: "#1a0b00"
  ink-on-sea: "#041018"
  signal-deep: "#8a4b00"
  input-deep: "#0c1c30"
  panel-lift: "#0f243f"
  heading-mist: "#d7e3f7"
  navy-deep: "#071526"
typography:
  headline:
    fontFamily: "Syne, Avenir Next, sans-serif"
    fontSize: "clamp(2.5rem, 8vw, 5.5rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  display:
    fontFamily: "Syne, Avenir Next, sans-serif"
    fontSize: "clamp(1.6rem, 4vw, 2.4rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-sm:
    fontFamily: "Syne, Avenir Next, sans-serif"
    fontSize: "clamp(1.45rem, 7vw, 1.9rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Syne, Avenir Next, sans-serif"
    fontSize: "clamp(1.85rem, 4vw, 2.35rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  lead-sub:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "clamp(1.05rem, 2vw, 1.2rem)"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  channel:
    fontFamily: "Syne, Avenir Next, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Syne, Avenir Next, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  body:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0.02em"
  chip:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "normal"
  caption:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0.04em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  sm: "0.45rem"
  md: "0.75rem"
  lg: "0.85rem"
  xl: "1rem"
  pill: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.45rem"
  md: "0.75rem"
  lg: "1.05rem"
  xl: "1.25rem"
  touch: "2.75rem"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink-on-signal}"
    rounded: "{rounded.pill}"
    padding: "0.55rem 1.1rem"
    height: "{spacing.touch}"
  button-primary-hover:
    backgroundColor: "{colors.signal-hot}"
    textColor: "{colors.ink-on-signal}"
    rounded: "{rounded.pill}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "0.45rem 0.85rem"
    height: "{spacing.touch}"
  button-deploy:
    backgroundColor: "color-mix(in oklab, {colors.panel} 80%, transparent)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.55rem 0.9rem"
    height: "{spacing.touch}"
  button-deploy-on:
    backgroundColor: "color-mix(in oklab, {colors.ok} 28%, transparent)"
    textColor: "{colors.ok-ink}"
    rounded: "{rounded.pill}"
  chip:
    backgroundColor: "color-mix(in oklab, {colors.panel} 88%, white 6%)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 0.85rem"
    height: "{spacing.touch}"
  chip-active:
    backgroundColor: "{colors.sea-bright}"
    textColor: "{colors.ink-on-sea}"
    rounded: "{rounded.pill}"
  input-field:
    backgroundColor: "color-mix(in oklab, {colors.panel} 85%, transparent)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.8rem"
    height: "{spacing.touch}"
  channel-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  tag-staged:
    backgroundColor: "color-mix(in oklab, {colors.sea} 18%, transparent)"
    textColor: "{colors.sea-bright}"
    rounded: "{rounded.sm}"
  tag-deployed:
    backgroundColor: "color-mix(in oklab, {colors.signal} 22%, transparent)"
    textColor: "{colors.signal-hot}"
    rounded: "{rounded.sm}"
---

# Design System: RF Orca

## Overview

**Creative North Star: "Night Watch Desk"**

RF Orca’s visual world is a dark RF desk under house lights: lean, scannable, and signal-clear. Coordinators and crews work on phones in time pressure — the UI earns trust by staying quiet until Tools unlock, then offering dense but readable mark controls. Brand personality from the product record (lean · crew-first · signal-clear) shows up as cyan “sonar” accents on deep navy, orange for attention and deploy heat, and monospace MHz as the only costume for “technical.”

Depth is tonal, not theatrical: navy → panel → foam layers, soft ambient shadow on hero moments, pill chips for filters and actions. Operate mode wins over marketing chrome. Confirmed rejections: purple SaaS gradients, cream-serif AI landings, bloated A/V dashboards, account-walled directories, and decorative glass as identity.

**Key Characteristics:**
- Dark navy hull with cyan sea accents and orange signal heat
- Syne display + Source Sans body + IBM Plex Mono for frequencies
- Pill chips / Deploy buttons; panels with soft radius (~0.85rem)
- Floor tap targets ≥44px (`--touch-min`)
- Motion respects `prefers-reduced-motion`; flash becomes static highlight

## Colors

A night-ops palette: deep navy fields, cyan for live/active chrome, orange for urgency and “who/updated,” mint reserved for deployed/in-use confirmation.

### Primary
- **Deep Watch Navy** (`navy` / `#06101f`): Page canvas and board field — the desk under lights.
- **Panel Steel** (`panel` / `#10263f`): Raised surfaces, chips at rest, tools chrome.
- **Sea Cyan** (`sea` / `#1aa7c4`) and **Sonar Bright** (`sea-bright` / `#4ae0f5`): Active filters, live pills, focus rings, brand energy — use sparingly for state, not wallpaper.

### Secondary
- **Signal Orange** (`signal` / `#ff7a1a`) and **Signal Hot** (`signal-hot` / `#ffb060`): Primary CTAs (Create / New show), selection, “Updated,” talent/who emphasis.
- **Ok Mint** (`ok` / `#5dffc0`), **Ok Ink** (`ok-ink` / `#b8ffe0`), **Ok Soft** (`ok-soft` / `#9bffd8`): Deployed / in-use confirmation only — never decorative fills.

### Tertiary
- **Danger Coral** (`danger` / `#ff7a88`): Delete / danger zone only.

### Neutral
- **Ink** (`ink` / `#f2f6ff`): Primary text on dark.
- **Ink Soft** (`ink-soft` / `#c5d2e8`): Secondary labels, quiet actions.
- **Navy 2 / Foam / Sand**: Intermediate fields (`#0a1a30`, `#0d2038`, `#0b1728`) for gradients and recessed zones.

### Named Rules
**The Signal Rarity Rule.** Orange and bright cyan mark state and action — never flood a screen. If every chip is bright, nothing is urgent.

**The Label-Plus-Color Rule.** Allowed / Blocked / Deployed / Staged always carry text tags, not color alone.

## Typography

**Display Font:** Syne (Avenir Next fallback)  
**Body Font:** Source Sans 3  
**Label/Mono Font:** IBM Plex Mono

**Character:** Syne is confident and slightly geometric for show titles and channel names; Source Sans stays readable on phones; Plex Mono owns MHz, rack CH, and data so “tech” never leaks into body copy.

### Hierarchy
- **Headline** (`--text-headline`, 800): Home / brand lock moments only.
- **Display** (`--text-display`, 700): Show name on the mark board; **Display-sm** on narrow boards.
- **Lead / Lead-sub** (`--text-lead`, `--text-lead-sub`): Home supporting titles and blurbs.
- **Channel** (`--text-channel`, 1.15rem): Channel name on the list row.
- **Title** (`--text-title`, 1rem): Group / room section headings.
- **Body** (`--text-body`, 1rem): Tools copy; inputs stay ≥16px on mobile.
- **Label** (`--text-label`, 0.85rem): Field captions, quiet chrome.
- **Chip** (`--text-chip`, 0.88rem): Filter and sort chips only.
- **Caption** (`--text-caption`, 0.72rem): Tags, “closed”, Updated badge — one micro size.
- **Mono** (`--text-mono`, 0.95rem): Frequencies, rack slots.

### Named Rules
**The Mono-Is-Data Rule.** IBM Plex Mono is for measurements and channel IDs only — never for marketing headlines.

**The One Caption Rule.** All micro labels share `--text-caption` (0.72rem) — no 0.65 / 0.68 / 0.78 scatter.

## Layout

Single-column Operate surfaces. Home: brand + **New show** above the fold; recent shows below. Mark board: sticky progress / select bar, horizontal scroll chip rows on narrow viewports, channel list as the primary scroll. Breakpoints observed: ~560 / 639 (rack 2-col) / 720 (board mobile) / 800+ denser tools.

**Spacing tokens** (`--space-xs` → `--space-xl`): xs `0.35rem`, sm `0.45rem`, md `0.75rem`, lg `1.05rem`, xl `1.25rem`, plus `--touch-min: 2.75rem`. Board siblings use **lg**; filter/bulk cluster (`.board-scope`) uses **xs** between rows and an extra **sm** before the list/rack. Section blocks use **xl**; channels inside a section stay tighter (`--space-md`).

Floor controls share `--touch-min`. Narrow filters/bulk rows fade at the trailing edge so overflow is discoverable. Sticky select bar sits under the measured progress HUD (`--sticky-hud-clearance`). Keyboard focus uses a shared sea-bright ring; `caret-color` is sea-bright on dark fields. Activity / import scroll areas use thin sea-tinted scrollbars (filter rows stay scrollbar-hidden).

### Named Rules
**The Thumb Floor Rule.** Interactive mark-board controls meet ≥44px hit targets even when the visible glyph is smaller (e.g. select circle).

**The Scope Cluster Rule.** Band / group / status filters share one quiet `.filters-unified` strip (text-like idle, cyan when active) so they don’t read as a pill wall equal to Deploy. Bulk select uses underline actions; status bulk is one select. **Mobile floor-first (explore B)** is parked — desktop hierarchy first.

**The Sticky Stack Rule.** Progress HUD sticks above the select bar; select never shares the same `top` as the HUD.

## Elevation & Depth

Tonal layering first: navy canvas → panel chips → foam recesses. A single ambient `--shadow` (`0 22px 60px` dark) appears on hero / elevated moments — not on every card. Sticky select bar may use light backdrop blur for legibility while scrolling; blur is utilitarian, not glass identity.

### Shadow Vocabulary
- **Ambient desk** (`0 22px 60px color-mix(in oklab, black 55%, transparent)`): Hero / lockup lift only.

### Named Rules
**The Flat-By-Default Rule.** List rows and chips stay flat at rest; depth comes from tone and border, not stacked shadows.

## Shapes

Soft industrial: panels ~0.85rem, inputs ~0.75rem, small controls ~0.45rem, actions and filters as pills (`999px`). Select affordance is a circle glyph inside a square hit target. Borders use translucent sea-line (`--line`), not heavy hairlines.

## Components

### Buttons
- **Shape:** Full pill (`999px`), min-height touch.
- **Primary:** Signal orange gradient fill → dark brown text (Create / high-intent).
- **Deploy:** Neutral panel pill; **on** state shifts to ok-mint wash + mint text.
- **Ghost / Quiet:** Transparent, ink-soft label; border appears on hover.
- **Focus:** 2px `sea-bright` outline, 2px offset.

### Chips
- **Style:** Panel wash, soft border, pill; **active** = solid `sea-bright` on near-black text.
- **Use:** Filters (All / Staged / No room), list sort (By room), Close all / Open all.

### Cards / Containers
- Channel rows and tool panels: soft radius, tonal fill, sea-line border when selected/deployed.
- No nested card stacks; one surface per job.

### Inputs / Fields
- Panel wash, `0.75rem` radius, touch height; focus via sea outline.
- Room / Who / Stage room live inline on the channel row for floor speed.

### Navigation
- Quiet Tools unlock; Crew mode strips chrome. Footer legal only — no app sidebar.

### Channel row (signature)
- Select circle, name (editable when unlocked), mono MHz + band tag, Deploy, optional Stage room / Who.
- Staged rooms use dashed sea tag; deployed rooms use signal tag.

### Named Rules
**The Quiet Tools Rule.** Coordinator power stays collapsed until unlocked — never permanent admin chrome on the floor view.

## Do's and Don'ts

### Do:
- **Do** keep the Night Watch Desk: dark navy, cyan state, orange heat, mint for “live/deployed.”
- **Do** use pill chips for filters and Syne for show/channel titles.
- **Do** meet `--touch-min` (2.75rem) on mark-board controls.
- **Do** honor `prefers-reduced-motion` (no flash pulse; keep static highlight).
- **Do** pair status color with text labels (Staged / Deployed / Locked).

### Don't:
- **Don't** introduce purple gradients, cream paper, or serif “AI landing” aesthetics.
- **Don't** use cards-of-cards or dashboard nav that buries Deploy.
- **Don't** put account walls or permanent show libraries on the home fold.
- **Don't** use monospace for display headlines or emoji as the icon system.
- **Don't** rely on hover-only affordances for floor tasks.
