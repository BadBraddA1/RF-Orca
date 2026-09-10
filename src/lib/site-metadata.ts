/**
 * Shared meta for RForca (RF Orca).
 * Keep og descriptions ~125 characters for social previews.
 *
 * og:image / metadataBase must resolve on a host crawlers can fetch.
 */
export const siteName = "RForca"
export const siteShortName = "RForca"
export const siteTitle = "RForca"
/** Keep ≤ ~125 characters for social truncations. */
export const siteDescription =
  "Share a frequency plan with the floor: group channels and track what’s deployed by room — no accounts."
export const ogImageAlt =
  "RForca — crew mark board for live RF deploy tracking"

/** Working production host. */
const LIVE_SITE_URL = "https://rforca.com"
/** Vercel default host. */
export const vercelFallbackUrl = "https://rf-orca.vercel.app"
/** Braddcorp subdomain alias. */
export const braddcorpAliasUrl = "https://rforca.braddcorp.com"

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
  "RForca",
  "RF Orca",
  "wireless microphone",
  "frequency coordination",
  "Shure Workbench",
  "live production RF",
] as const
