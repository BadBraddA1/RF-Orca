import * as Sentry from "@sentry/nextjs"
import posthog from "posthog-js"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
  profileSessionSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
  profileLifecycle: "trace",
  // Keep replay lighter on floor phones / bad venue wifi
  replaysSessionSampleRate: 0.02,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
  // Ably teardown / tab close — not actionable product bugs
  ignoreErrors: ["Connection closed", /^Connection closed$/],
  integrations: [
    Sentry.browserProfilingIntegration(),
    Sentry.replayIntegration({
      // Default masks all text (PII). Unmask UI chrome so replays stay readable.
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
})

function initPostHog() {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!posthogKey) return
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://n.braddcorp.com",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com",
    defaults: "2026-05-30",
    capture_exceptions: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    debug: process.env.NODE_ENV === "development",
  })
  posthog.register({ product: "rf-orca" })
}

/** Don’t compete with first paint / board hydrate on bad venue wifi. */
function deferPostHog() {
  if (typeof window === "undefined") return
  const run = () => initPostHog()
  const ric = (
    window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number
    }
  ).requestIdleCallback
  if (typeof ric === "function") {
    ric(() => run(), { timeout: 4000 })
  } else {
    window.setTimeout(run, 1500)
  }
}

deferPostHog()

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
