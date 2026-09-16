"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type Ably from "ably";
import { getAblyClientId } from "@/lib/ably-client-id";
import type { CrewAnnotateEvent, CrewClearMsg, CrewStrokeMsg } from "@/lib/crew-draw";

const ABLY_ATTACH_RETRIES = 2;

/**
 * Prefer Ably push for show board updates; fall back to revision polling.
 * Also opens the annotate channel for Audio Crew shared drawing.
 *
 * Channel `subscribe()` implicitly attaches and returns a Promise that rejects
 * on attach timeout (90007) — those must be caught or they become unhandled
 * rejections (RF-ORCA-5). Attach failures fall back to poll so the board stays usable.
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
    void channel.publish("stroke", stroke).catch(() => {
      /* annotate publish is best-effort on weak venue wifi */
    });
  }, []);

  const publishClear = useCallback(() => {
    const channel = annotateChannelRef.current;
    if (!channel) return;
    const payload: CrewClearMsg = {
      clear: true,
      at: new Date().toISOString(),
    };
    void channel.publish("clear", payload).catch(() => {
      /* best-effort */
    });
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
    let ablyAbandoned = false;

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

    function markAblyLive() {
      if (cancelled || ablyAbandoned) return;
      usingAbly = true;
      stopPoll();
      setLive(true);
      setTransport("ably");
    }

    function fallBackToPoll(reason?: string) {
      if (cancelled) return;
      usingAbly = false;
      setAnnotateReady(false);
      annotateChannelRef.current = null;
      if (reason) {
        console.warn("[ably] falling back to poll:", reason);
      }
      startPoll();
    }

    function abandonAbly(reason: string) {
      if (cancelled || ablyAbandoned) return;
      ablyAbandoned = true;
      fallBackToPoll(reason);
      if (ably) {
        try {
          ably.connection.off();
          ably.close();
        } catch {
          /* expected on teardown */
        }
        ably = null;
      }
    }

    /** Await attach via subscribe; retry a couple times, then give up. */
    async function subscribeWithRetry(
      channel: Ably.RealtimeChannel,
      event: string,
      listener: (message: Ably.Message) => void,
    ): Promise<boolean> {
      let lastError: unknown;
      for (let attempt = 0; attempt <= ABLY_ATTACH_RETRIES; attempt++) {
        if (cancelled || ablyAbandoned) return false;
        try {
          await channel.subscribe(event, listener);
          return true;
        } catch (err) {
          lastError = err;
          // Explicit retry — SDK also auto-retries suspended channels, but we
          // want a bounded recover path before abandoning push for this session.
          if (attempt < ABLY_ATTACH_RETRIES) {
            try {
              await channel.attach();
            } catch {
              /* attach may reject again; loop retries subscribe */
            }
          }
        }
      }
      const message =
        lastError instanceof Error
          ? lastError.message
          : "channel attach failed";
      console.warn("[ably] subscribe/attach failed:", message);
      return false;
    }

    function watchChannelLifecycle(
      channel: Ably.RealtimeChannel,
      opts: { critical: boolean; onAttached?: () => void },
    ) {
      channel.on((change) => {
        if (cancelled || ablyAbandoned) return;
        const state = change.current;
        if (state === "attached") {
          opts.onAttached?.();
          return;
        }
        if (state === "suspended") {
          // Non-fatal: keep poll as backup until Ably reattaches.
          usingAbly = false;
          startPoll();
          if (opts.critical) setAnnotateReady(false);
          return;
        }
        if (state === "failed") {
          const reason =
            change.reason?.message ?? channel.errorReason?.message ?? "failed";
          if (opts.critical) {
            abandonAbly(`channel failed: ${reason}`);
          } else {
            setAnnotateReady(false);
            annotateChannelRef.current = null;
          }
        }
      });
    }

    async function tryAbly() {
      if (ablyAbandoned) return;
      try {
        const clientId = getAblyClientId();
        const authUrl = `/api/ably-auth?show=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`;
        const probe = await fetch(authUrl, { cache: "no-store" });
        if (!probe.ok || cancelled) return;

        const { default: AblyCtor } = await import("ably");
        if (cancelled || ablyAbandoned) return;

        const client = new AblyCtor.Realtime({
          clientId,
          authUrl,
        });
        ably = client;

        client.connection.on("connected", () => {
          if (cancelled || ablyAbandoned) return;
          // Stay on poll until the show channel is attached — connection alone
          // is not enough (attach timeout left boards stuck "Live" with no push).
        });
        client.connection.on("disconnected", () => {
          if (cancelled || ablyAbandoned) return;
          fallBackToPoll("connection disconnected");
        });
        client.connection.on("closed", () => {
          if (cancelled || ablyAbandoned) return;
          usingAbly = false;
          setAnnotateReady(false);
          annotateChannelRef.current = null;
          setLive(false);
        });
        client.connection.on("failed", () => {
          if (cancelled) return;
          abandonAbly("connection failed");
        });
        client.connection.on("suspended", () => {
          if (cancelled || ablyAbandoned) return;
          fallBackToPoll("connection suspended");
        });

        const channel = client.channels.get(`show:${token}`);
        watchChannelLifecycle(channel, {
          critical: true,
          onAttached: () => {
            markAblyLive();
          },
        });

        const showOk = await subscribeWithRetry(channel, "update", () => {
          onInvalidateRef.current();
        });
        if (!showOk || cancelled || ablyAbandoned) {
          if (!ablyAbandoned) abandonAbly("show channel attach timed out");
          return;
        }
        markAblyLive();

        const annotate = client.channels.get(`show:${token}:annotate`);
        watchChannelLifecycle(annotate, {
          critical: false,
          onAttached: () => {
            if (cancelled || ablyAbandoned) return;
            annotateChannelRef.current = annotate;
            setAnnotateReady(true);
          },
        });

        const strokeOk = await subscribeWithRetry(
          annotate,
          "stroke",
          (message) => {
            const data = message.data as CrewStrokeMsg | undefined;
            if (!data?.id || !Array.isArray(data.pts)) return;
            emitAnnotate({ type: "stroke", stroke: data });
          },
        );
        if (!strokeOk || cancelled || ablyAbandoned) {
          setAnnotateReady(false);
          annotateChannelRef.current = null;
          // Show channel still works; annotate is optional.
          return;
        }

        await annotate
          .subscribe("clear", (message) => {
            const data = message.data as CrewClearMsg | undefined;
            emitAnnotate({
              type: "clear",
              at: data?.at ?? new Date().toISOString(),
            });
          })
          .catch(() => {
            /* already attached; second subscribe shouldn't fail attach */
          });

        if (!cancelled && !ablyAbandoned) {
          annotateChannelRef.current = annotate;
          setAnnotateReady(true);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "ably init failed";
        if (!cancelled) abandonAbly(message);
        else startPoll();
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
