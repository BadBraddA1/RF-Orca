import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sentry/profiling-node", "ably"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Document-Policy", value: "js-profiling" }],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "braddcorp",
  project: process.env.SENTRY_PROJECT || "rf-orca",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
})
