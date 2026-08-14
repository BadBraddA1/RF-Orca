/**
 * Shared meta for RF Orca (Radio Frequency Orchestrator).
 * Keep og descriptions ~125 characters for social previews.
 *
 * og:image / metadataBase must resolve on a host crawlers can fetch.
 */
export const siteName = "RF Orca"
export const siteShortName = "Orca"
export const siteTitle = "RF Orca — Radio Frequency Orchestrator"
/** Keep ≤ ~125 characters for social truncations. */
export const siteDescription =
  "Share a frequency plan with the floor: group channels and track what’s deployed by room — no accounts."
export const ogImageAlt =
  "RF Orca — Radio Frequency Orchestrator, crew mark board for live RF deploy tracking"

/** Working production host. */
const LIVE_SITE_URL = "https://rforca.braddcorp.com"
/** Fallback if custom domain is unavailable. */
export const vercelFallbackUrl = "https://rf-orca.vercel.app"

function resolveSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "").trim()
  if (fromEnv) return fromEnv
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
  }
  return LIVE_SITE_URL
}

export const siteUrl = resolveSiteUrl()

export const ogImagePath = "/opengraph-image"
export const twitterImagePath = "/twitter-image"

export const siteKeywords = [
  "RF Orca",
  "Radio Frequency Orchestrator",
  "wireless microphone",
  "frequency coordination",
  "Shure Workbench",
  "live production RF",
] as const
