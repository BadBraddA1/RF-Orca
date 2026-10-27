import * as Sentry from "@sentry/nextjs"

// No @sentry/profiling-node — native .node binaries break OpenNext/Workers bundling.
// Profiling stays available on Vercel via Document-Policy js-profiling + client SDK.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  includeLocalVariables: true,
  enableLogs: true,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
})
