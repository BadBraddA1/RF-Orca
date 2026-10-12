/** Server instrumentation — skipped on Cloudflare Workers (workerd). */
function isCloudflareWorkerd(): boolean {
  if (process.env.NEXT_RUNTIME === "edge") return true
  // OpenNext on Workers often reports NEXT_RUNTIME=nodejs with nodejs_compat.
  if (typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined") {
    return true
  }
  return false
}

export async function register() {
  if (isCloudflareWorkerd()) {
    // Edge/workerd: @sentry/nextjs server hooks are unreliable here.
    return
  }
  // Node (Vercel / local): load Sentry server config when present.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("../sentry.server.config")
    } catch (error) {
      console.error("Sentry server instrumentation failed", error)
    }
  }
}
