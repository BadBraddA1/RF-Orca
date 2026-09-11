/**
 * Keep the screen awake on the floor phone board.
 * Prefer Screen Wake Lock; fall back to a tiny muted looping video (iOS Safari).
 */

import { KEEP_AWAKE_MP4, KEEP_AWAKE_WEBM } from "./keep-awake-media";

export type KeepAwakeHandle = {
  release: () => Promise<void>;
};

let sharedVideo: HTMLVideoElement | null = null;

function ensureFallbackVideo(): HTMLVideoElement {
  if (sharedVideo) return sharedVideo;
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("muted", "");
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";

  const canWebm = video.canPlayType('video/webm; codecs="vp8"') !== "";
  video.src = canWebm ? KEEP_AWAKE_WEBM : KEEP_AWAKE_MP4;
  video.style.cssText =
    "position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);
  sharedVideo = video;
  return video;
}

export function keepAwakeAvailable(): boolean {
  return typeof document !== "undefined";
}

export async function requestKeepAwake(): Promise<KeepAwakeHandle | null> {
  if (typeof document === "undefined") return null;

  if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      return {
        release: async () => {
          try {
            await sentinel.release();
          } catch {
            /* already released */
          }
        },
      };
    } catch {
      /* iOS / restricted contexts — try video fallback */
    }
  }

  try {
    const video = ensureFallbackVideo();
    await video.play();
    return {
      release: async () => {
        video.pause();
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}
