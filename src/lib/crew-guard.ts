import type { BoardRole, Channel, ShowFeatures } from "./types";
import { DEPLOY_UNDO_GRACE_SEC } from "./types";
import { withinDeployGrace } from "./board-helpers";

type CrewPatch = {
  status?: unknown;
  deployed?: boolean;
  roomName?: string | null;
  groupName?: string | null;
  assignedTo?: string | null;
  inUse?: boolean;
  micKind?: string | null;
  name?: string;
};

function roomKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Returns an error message if a non-admin patch violates show feature locks.
 * Admins bypass all of these. BO Lead bypasses crew freeze + staged/deploy locks
 * (can undeploy / restage) but not Tools-only edits (rename, status, groups).
 * Deploy undo has a short grace window for plain crew.
 */
export function crewPatchBlocked(
  features: ShowFeatures,
  channel: Channel,
  patch: CrewPatch,
  role: BoardRole = "crew",
): string | null {
  if (role === "admin") return null;

  const elevated = role === "boLead";
  const undeploying = patch.deployed === false && channel.deployed;
  const inDeployGrace =
    undeploying &&
    features.lockDeployed &&
    withinDeployGrace(channel.deployedAt, DEPLOY_UNDO_GRACE_SEC);

  if (features.crewLocked && !elevated) {
    if (
      typeof patch.deployed === "boolean" ||
      patch.roomName !== undefined ||
      patch.assignedTo !== undefined ||
      typeof patch.inUse === "boolean" ||
      patch.micKind !== undefined
    ) {
      return "Board is locked for crew. Coordinator can unlock in Tools → Show options.";
    }
  }

  if (!features.deploy && typeof patch.deployed === "boolean") {
    return "Deploy marking is turned off for this show.";
  }

  if (!features.rooms && patch.roomName !== undefined) {
    return "Rooms are turned off for this show.";
  }

  if (
    !features.assignments &&
    (patch.assignedTo !== undefined ||
      typeof patch.inUse === "boolean" ||
      patch.micKind !== undefined)
  ) {
    return "Mic assignments are turned off for this show.";
  }

  if (patch.name !== undefined) {
    return "Renaming channels requires coordinator unlock.";
  }

  // Grace undeploy wins over stage/deploy locks (toast Undo / tap Deployed).
  if (inDeployGrace) return null;

  if (features.lockStaged && !elevated) {
    const currentRoom = roomKey(channel.roomName);
    const changingRoom =
      patch.roomName !== undefined && roomKey(patch.roomName) !== currentRoom;
    if (currentRoom && changingRoom) {
      return "Staged room is locked. Coordinator or BO Lead can change it.";
    }
  }

  if (features.lockDeployed && channel.deployed && !elevated) {
    const changingRoom =
      patch.roomName !== undefined &&
      roomKey(patch.roomName) !== roomKey(channel.roomName);
    if (undeploying || changingRoom) {
      return "Deployed channels are locked. Coordinator or BO Lead can change them.";
    }
  }

  return null;
}
