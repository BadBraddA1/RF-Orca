import type { Channel, ShowFeatures } from "./types";
import { DEPLOY_UNDO_GRACE_SEC } from "./types";
import { withinDeployGrace } from "./board-helpers";

type CrewPatch = {
  status?: unknown;
  deployed?: boolean;
  roomName?: string | null;
  groupName?: string | null;
  assignedTo?: string | null;
  inUse?: boolean;
  name?: string;
};

/**
 * Returns an error message if a non-admin patch violates show feature locks.
 * Admins bypass all of these. Deploy undo has a short grace window.
 */
export function crewPatchBlocked(
  features: ShowFeatures,
  channel: Channel,
  patch: CrewPatch,
): string | null {
  if (features.crewLocked) {
    if (
      typeof patch.deployed === "boolean" ||
      patch.roomName !== undefined ||
      patch.assignedTo !== undefined ||
      typeof patch.inUse === "boolean"
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
    (patch.assignedTo !== undefined || typeof patch.inUse === "boolean")
  ) {
    return "Mic assignments are turned off for this show.";
  }

  if (patch.name !== undefined) {
    return "Renaming channels requires coordinator unlock.";
  }

  if (features.lockDeployed && channel.deployed) {
    const undeploying = patch.deployed === false;
    const changingRoom =
      patch.roomName !== undefined && patch.roomName !== channel.roomName;
    const inGrace = withinDeployGrace(
      channel.deployedAt,
      DEPLOY_UNDO_GRACE_SEC,
    );
    if (undeploying && inGrace) return null;
    if (undeploying || changingRoom) {
      return "Deployed channels are locked. Coordinator can change them after unlock.";
    }
  }

  return null;
}
