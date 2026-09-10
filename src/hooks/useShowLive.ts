"use client";

import { useEffect, useRef, useState } from "react";
import type Ably from "ably";

/**
 * Prefer Ably push for show board updates; fall back to revision polling.
 * Starts on poll so weak cell/wifi get live updates without waiting on Ably's
 * WebSocket + SDK download; upgrades to Ably when the network allows.
 */
export function useShowLive(
  token: string,
  onInvalidate: () => void,
): { live: boolean; transport: "ably" | "poll" | "offline" } {
  const [live, setLive] = useState(false);
  const [transport, setTransport] = useState<"ably" | "poll" | "offline">(
    "offline",
  );
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    let cancelled = false;
    let ably: Ably.Realtime | null = null;
    let pollId: number | null = null;
    let revision = -1;
    let usingAbly = false;

    async function pollOnce() {
      if (usingAbly) return;
      try {
        const res = await fetch(
          `/api/shows/${token}/live?r=${revision < 0 ? "" : revision}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.revision === "number") revision = data.revision;
        if (!data.unchanged) onInvalidateRef.current();
        if (!cancelled && !usingAbly) {
          setLive(true);
          setTransport("poll");
        }
      } catch {
        if (!cancelled && !usingAbly) {
          setLive(false);
          setTransport("offline");
        }
      }
    }

    function startPoll() {
      void pollOnce();
      if (pollId != null) return;
      pollId = window.setInterval(() => {
        void pollOnce();
      }, 2000);
    }

    function stopPoll() {
      if (pollId != null) {
        window.clearInterval(pollId);
        pollId = null;
      }
    }

    async function tryAbly() {
      try {
        const probe = await fetch(
          `/api/ably-auth?show=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!probe.ok || cancelled) return;

        // Dynamic import keeps Ably off the critical first-paint path.
        const { default: AblyCtor } = await import("ably");
        if (cancelled) return;

        const client = new AblyCtor.Realtime({
          authUrl: `/api/ably-auth?show=${encodeURIComponent(token)}`,
        });
        ably = client;

        client.connection.on("connected", () => {
          if (cancelled) return;
          usingAbly = true;
          stopPoll();
          setLive(true);
          setTransport("ably");
        });
        client.connection.on("disconnected", () => {
          if (cancelled) return;
          usingAbly = false;
          setLive(false);
          startPoll();
        });
        client.connection.on("closed", () => {
          if (cancelled) return;
          usingAbly = false;
          setLive(false);
        });
        client.connection.on("failed", () => {
          if (cancelled) return;
          usingAbly = false;
          try {
            client.close();
          } catch {
            /* Ably close can reject with "Connection closed" */
          }
          ably = null;
          startPoll();
        });

        const channel = client.channels.get(`show:${token}`);
        channel.subscribe("update", () => {
          onInvalidateRef.current();
        });
      } catch {
        if (!cancelled) startPoll();
      }
    }

    // Poll first so the board stays fresh on bad networks; Ably upgrades later.
    startPoll();
    const ablyDelay = window.setTimeout(() => {
      void tryAbly();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(ablyDelay);
      stopPoll();
      if (ably) {
        try {
          ably.connection.off();
          ably.close();
        } catch {
          /* expected on teardown */
        }
        ably = null;
      }
    };
  }, [token]);

  return { live, transport };
}
