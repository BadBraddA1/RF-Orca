import {
  DEFAULT_SHOW_FEATURES,
  type ShowFeatures,
} from "./types";

export function parseFeatures(raw: unknown): ShowFeatures {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  return {
    deploy: bool(obj.deploy, DEFAULT_SHOW_FEATURES.deploy),
    rooms: bool(obj.rooms, DEFAULT_SHOW_FEATURES.rooms),
    assignments: bool(obj.assignments, DEFAULT_SHOW_FEATURES.assignments),
    groups: bool(obj.groups, DEFAULT_SHOW_FEATURES.groups),
    status: bool(obj.status, DEFAULT_SHOW_FEATURES.status),
    lockDeployed: bool(obj.lockDeployed, DEFAULT_SHOW_FEATURES.lockDeployed),
    lockStaged: bool(obj.lockStaged, DEFAULT_SHOW_FEATURES.lockStaged),
    crewLocked: bool(obj.crewLocked, DEFAULT_SHOW_FEATURES.crewLocked),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function mergeFeatures(
  current: ShowFeatures,
  patch: Partial<ShowFeatures>,
): ShowFeatures {
  return parseFeatures({ ...current, ...patch });
}
