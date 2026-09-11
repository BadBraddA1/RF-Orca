"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type Ably from "ably";
import { getAblyClientId } from "@/lib/ably-client-id";
import type { CrewAnnotateEvent, CrewClearMsg, CrewStrokeMsg } from "@/lib/crew-draw";

/**
 * Prefer Ably push for show board updates; fall back to revision polling.
 * Also opens the annotate channel for Audio Crew shared drawing.
 */
export function useShowLive(
  token: string,
  onInvalidate: () => void,
): {
  live: boolean;
  transport: "ably" | "poll" | "offline";
  annotateReady: boolean;
  publishStroke: (stroke: CrewStrokeMsg) => void;
  publishClear: () => void;
  subscribeAnnotate: (handler: (event: CrewAnnotateEvent) => void) => () => void;
} {
  const [live, setLive] = useState(false);
  const [transport, setTransport] = useState<"ably" | "poll" | "offline">(
    "offline",
  );
  const [annotateReady, setAnnotateReady] = useState(false);
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  const annotateChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const annotateHandlersRef = useRef(
    new Set<(event: CrewAnnotateEvent) => void>(),
  );

  const publishStroke = useCallback((stroke: CrewStrokeMsg) => {
    const channel = annotateChannelRef.current;
    if (!channel) return;
    void channel.publish("stroke", stroke);
  }, []);

  const publishClear = useCallback(() => {
    const channel = annotateChannelRef.current;
    if (!channel) return;
    const payload: CrewClearMsg = {
      clear: true,
      at: new Date().toISOString(),
    };
    void channel.publish("clear", payload);
  }, []);

  const subscribeAnnotate = useCallback(
    (handler: (event: CrewAnnotateEvent) => void) => {
      annotateHandlersRef.current.add(handler);
      return () => {
        annotateHandlersRef.current.delete(handler);
      };
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let ably: Ably.Realtime | null = null;
    let pollId: number | null = null;
    let revision = -1;
    let usingAbly = false;

    function emitAnnotate(event: CrewAnnotateEvent) {
      for (const handler of annotateHandlersRef.current) {
        try {
          handler(event);
        } catch {
          /* ignore listener errors */
        }
      }
    }

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
        const clientId = getAblyClientId();
        const authUrl = `/api/ably-auth?show=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`;
        const probe = await fetch(authUrl, { cache: "no-store" });
        if (!probe.ok || cancelled) return;

        const { default: AblyCtor } = await import("ably");
        if (cancelled) return;

        const client = new AblyCtor.Realtime({
          clientId,
          authUrl,
        });
        ably = client;

        client.connection.on("connected", () => {
          if (cancelled) return;
          usingAbly = true;
          stopPoll();
          setLive(true);
          setTransport("ably");
          setAnnotateReady(true);
        });
        client.connection.on("disconnected", () => {
          if (cancelled) return;
          usingAbly = false;
          setAnnotateReady(false);
          annotateChannelRef.current = null;
          setLive(false);
          startPoll();
        });
        client.connection.on("closed", () => {
          if (cancelled) return;
          usingAbly = false;
          setAnnotateReady(false);
          annotateChannelRef.current = null;
          setLive(false);
        });
        client.connection.on("failed", () => {
          if (cancelled) return;
          usingAbly = false;
          setAnnotateReady(false);
          annotateChannelRef.current = null;
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

        const annotate = client.channels.get(`show:${token}:annotate`);
        annotateChannelRef.current = annotate;
        annotate.subscribe("stroke", (message) => {
          const data = message.data as CrewStrokeMsg | undefined;
          if (!data?.id || !Array.isArray(data.pts)) return;
          emitAnnotate({ type: "stroke", stroke: data });
        });
        annotate.subscribe("clear", (message) => {
          const data = message.data as CrewClearMsg | undefined;
          emitAnnotate({
            type: "clear",
            at: data?.at ?? new Date().toISOString(),
          });
        });
      } catch {
        if (!cancelled) startPoll();
      }
    }

    startPoll();
    const ablyDelay = window.setTimeout(() => {
      void tryAbly();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(ablyDelay);
      stopPoll();
      annotateChannelRef.current = null;
      setAnnotateReady(false);
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

  return {
    live,
    transport,
    annotateReady,
    publishStroke,
    publishClear,
    subscribeAnnotate,
  };
}
