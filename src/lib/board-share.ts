import type { ShowFeatures } from "@/lib/types";

export type BoardViewParam = "list" | "rack";
export type ListSortParam = "group" | "room" | "flat";

export type BoardFilterParam =
  | "all"
  | "allowed"
  | "blocked"
  | "deployed"
  | "open"
  | "staged"
  | "unstaged"
  | "assigned"
  | "unassigned"
  | "inuse"
  | "spare";

export type BoardShareState = {
  view: BoardViewParam;
  sort: ListSortParam;
  room: string;
  band: string;
  group: string;
  filter: BoardFilterParam;
};

const FILTERS = new Set<BoardFilterParam>([
  "all",
  "allowed",
  "blocked",
  "deployed",
  "open",
  "staged",
  "unstaged",
  "assigned",
  "unassigned",
  "inuse",
  "spare",
]);

export function defaultListSortParam(features: ShowFeatures): ListSortParam {
  if (features.groups) return "group";
  if (features.rooms) return "room";
  return "flat";
}

export function parseBoardShareSearch(
  search: string,
  features: ShowFeatures,
): Partial<BoardShareState> {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const sp = new URLSearchParams(raw);
  const out: Partial<BoardShareState> = {};

  const view = sp.get("view");
  if (view === "list" || view === "rack") {
    if (view === "rack" && !(features.rooms || features.assignments)) {
      out.view = "list";
    } else {
      out.view = view;
    }
  }

  const sort = sp.get("sort");
  if (sort === "group" || sort === "room" || sort === "flat") {
    if (sort === "group" && !features.groups) {
      out.sort = features.rooms ? "room" : "flat";
    } else if (sort === "room" && !features.rooms) {
      out.sort = features.groups ? "group" : "flat";
    } else {
      out.sort = sort;
    }
  }

  const room = sp.get("room");
  if (room != null && room.trim()) out.room = room.trim();

  const band = sp.get("band");
  if (band != null && band.trim()) out.band = band.trim();

  const group = sp.get("group");
  if (group != null && group.trim()) out.group = group.trim();

  const filter = sp.get("filter");
  if (filter && FILTERS.has(filter as BoardFilterParam)) {
    out.filter = filter as BoardFilterParam;
  }

  return out;
}

export function buildBoardShareQuery(
  state: BoardShareState,
  features: ShowFeatures,
): string {
  const sp = new URLSearchParams();
  if (state.view !== "list") sp.set("view", state.view);

  const defaultSort = defaultListSortParam(features);
  if (state.sort !== defaultSort) sp.set("sort", state.sort);

  if (state.room.trim()) sp.set("room", state.room.trim());
  if (state.band !== "all" && state.band.trim()) sp.set("band", state.band.trim());
  if (state.group !== "all" && state.group.trim()) {
    sp.set("group", state.group.trim());
  }
  if (state.filter !== "all") sp.set("filter", state.filter);

  const q = sp.toString();
  return q ? `?${q}` : "";
}

export function syncBoardShareUrl(
  state: BoardShareState,
  features: ShowFeatures,
): void {
  if (typeof window === "undefined") return;
  const q = buildBoardShareQuery(state, features);
  // Always the crew path — never /bo/{leadToken} even if the address bar still has it.
  const path = crewShowPath(window.location.pathname);
  const next = `${path}${q}${window.location.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === cur) return;
  window.history.replaceState(window.history.state, "", next);
}

/** `/s/{token}` — strips a trailing `/bo/...` BO Lead claim path. */
export function crewShowPath(pathname: string): string {
  const match = pathname.match(/^(\/s\/[^/]+)/);
  return match ? match[1] : pathname;
}

/**
 * Absolute crew share URL for clipboard / navigator.share.
 * Never includes the BO Lead secret path or `?bo=` claim params.
 */
export function buildCrewShareUrl(
  origin: string,
  shareToken: string,
  state: BoardShareState,
  features: ShowFeatures,
): string {
  const q = buildBoardShareQuery(state, features);
  return `${origin.replace(/\/$/, "")}/s/${shareToken}${q}`;
}
