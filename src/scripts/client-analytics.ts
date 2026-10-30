import * as Sentry from "@sentry/browser";
import posthog from "posthog-js";

const sentryDsn =
  import.meta.env.PUBLIC_SENTRY_DSN ||
  import.meta.env.NEXT_PUBLIC_SENTRY_DSN ||
  "";

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.05,
    // Keep replay lighter on floor phones / bad venue wifi
    replaysSessionSampleRate: 0.02,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE || "production",
    // Ably teardown / tab close — not actionable product bugs
    ignoreErrors: ["Connection closed", /^Connection closed$/],
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
        unmask: [
          "button",
          "[type='button']",
          "[type='submit']",
          "[role='button']",
          "nav",
          "nav a",
          "nav button",
          "[role='navigation']",
          "[role='navigation'] a",
          "[role='navigation'] button",
          "h1",
          "h2",
          "h3",
          "label",
          ".sentry-unmask",
          "[data-sentry-unmask]",
        ],
        unblock: [".sentry-unblock", "[data-sentry-unblock]"],
        mask: [".sentry-mask", "[data-sentry-mask]", "[data-pii]"],
      }),
    ],
  });
}

function initPostHog() {
  const posthogKey =
    import.meta.env.PUBLIC_POSTHOG_KEY ||
    import.meta.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!posthogKey) return;
  posthog.init(posthogKey, {
    api_host:
      import.meta.env.PUBLIC_POSTHOG_HOST ||
      import.meta.env.NEXT_PUBLIC_POSTHOG_HOST ||
      "https://n.braddcorp.com",
    ui_host:
      import.meta.env.PUBLIC_POSTHOG_UI_HOST ||
      import.meta.env.NEXT_PUBLIC_POSTHOG_UI_HOST ||
      "https://us.posthog.com",
    defaults: "2026-05-30",
    capture_exceptions: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    debug: import.meta.env.DEV,
  });
  posthog.register({ product: "rf-orca" });
}

/** Don’t compete with first paint / board hydrate on bad venue wifi. */
function deferPostHog() {
  if (typeof window === "undefined") return;
  const run = () => initPostHog();
  const ric = (
    window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") {
    ric(() => run(), { timeout: 4000 });
  } else {
    window.setTimeout(run, 1500);
  }
}

deferPostHog();
