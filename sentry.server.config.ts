import * as Sentry from "@sentry/nextjs"
import type { Integration } from "@sentry/core"
import { nodeProfilingIntegration } from "@sentry/profiling-node"

Sentry.init({
  // npm can nest a second @sentry/core under profiling-node; cast avoids false TS mismatch.
  integrations: [nodeProfilingIntegration() as Integration],
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  profileSessionSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  profileLifecycle: "trace",
  includeLocalVariables: true,
  enableLogs: true,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
})
