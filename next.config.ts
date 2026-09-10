import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"

const longCache = "public, max-age=31536000, immutable"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sentry/profiling-node", "ably"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Document-Policy", value: "js-profiling" }],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: longCache }],
      },
      {
        source: "/favicon-:path*",
        headers: [{ key: "Cache-Control", value: longCache }],
      },
      {
        source: "/apple-touch-icon.png",
        headers: [{ key: "Cache-Control", value: longCache }],
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
