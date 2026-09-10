import { PostHog } from "posthog-node"

export function PostHogServer() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_KEY
  if (!key) return null
  return new PostHog(key, {
    host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ||
      process.env.POSTHOG_HOST ||
      "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  })
}
