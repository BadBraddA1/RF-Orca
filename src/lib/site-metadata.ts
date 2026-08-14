/**
 * Shared meta for RF Orca (Radio Frequency Orchestrator).
 * Keep og descriptions ~125 characters for social previews.
 */
export const siteName = "RF Orca"
export const siteShortName = "Orca"
export const siteTitle = "RF Orca — Radio Frequency Orchestrator"
/** Keep ≤ ~125 characters for social truncations. */
export const siteDescription =
  "Share Workbench plans with crews — group channels, mark allowed, and track what’s deployed by room."
export const ogImageAlt =
  "RF Orca — Radio Frequency Orchestrator for live crew frequency tracking"

const CANONICAL_SITE_URL = "https://rforca.braddcorp.com"

function resolveSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "").trim()
  if (fromEnv) return fromEnv
  if (process.env.VERCEL_ENV === "production") return CANONICAL_SITE_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
  }
  return CANONICAL_SITE_URL
}

export const siteUrl = resolveSiteUrl()

export const ogImagePath = "/opengraph-image"
export const twitterImagePath = "/twitter-image"

export const siteKeywords = [
  "RF Orca",
  "Radio Frequency Orchestrator",
  "Shure Workbench",
  "wireless microphone",
  "frequency coordination",
] as const
