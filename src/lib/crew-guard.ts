import type { Channel, ShowFeatures } from "./types";

type CrewPatch = {
  status?: unknown;
  deployed?: boolean;
  roomName?: string | null;
  groupName?: string | null;
};

/**
 * Returns an error message if a non-admin patch violates show feature locks.
 * Admins bypass all of these.
 */
export function crewPatchBlocked(
  features: ShowFeatures,
  channel: Channel,
  patch: CrewPatch,
): string | null {
  if (features.crewLocked) {
    if (
      typeof patch.deployed === "boolean" ||
      patch.roomName !== undefined
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

  if (features.lockDeployed && channel.deployed) {
    const undeploying = patch.deployed === false;
    const changingRoom =
      patch.roomName !== undefined && patch.roomName !== channel.roomName;
    if (undeploying || changingRoom) {
      return "Deployed channels are locked. Coordinator can change them after unlock.";
    }
  }

  return null;
}
