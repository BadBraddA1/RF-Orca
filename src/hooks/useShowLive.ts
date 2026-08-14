"use client";

import { useEffect, useRef, useState } from "react";
import Ably from "ably";

/**
 * Prefer Ably push for show board updates; fall back to revision polling.
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

    async function pollOnce() {
      try {
        const res = await fetch(
          `/api/shows/${token}/live?r=${revision < 0 ? "" : revision}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.revision === "number") revision = data.revision;
        if (!data.unchanged) onInvalidateRef.current();
        if (!cancelled) {
          setLive(true);
          setTransport("poll");
        }
      } catch {
        if (!cancelled) {
          setLive(false);
          setTransport("offline");
        }
      }
    }

    function startPoll() {
      void pollOnce();
      pollId = window.setInterval(() => {
        void pollOnce();
      }, 1500);
    }

    async function start() {
      try {
        const probe = await fetch(
          `/api/ably-auth?show=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!probe.ok) {
          startPoll();
          return;
        }

        ably = new Ably.Realtime({
          authUrl: `/api/ably-auth?show=${encodeURIComponent(token)}`,
        });

        ably.connection.on("connected", () => {
          if (cancelled) return;
          setLive(true);
          setTransport("ably");
        });
        ably.connection.on("disconnected", () => {
          if (!cancelled) setLive(false);
        });
        ably.connection.on("failed", () => {
          if (cancelled) return;
          ably?.close();
          ably = null;
          startPoll();
        });

        const channel = ably.channels.get(`show:${token}`);
        channel.subscribe("update", () => {
          onInvalidateRef.current();
        });
      } catch {
        startPoll();
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (pollId != null) window.clearInterval(pollId);
      ably?.close();
    };
  }, [token]);

  return { live, transport };
}
