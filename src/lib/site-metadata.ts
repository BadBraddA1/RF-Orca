/**
 * Shared meta for RForca (RF Orca).
 * Keep og descriptions ~125 characters for social previews.
 *
 * og:image / metadataBase must resolve on a host crawlers can fetch.
 */
export const siteName = "RForca";
export const siteShortName = "RForca";
export const siteTitle = "RForca";
/** Keep ≤ ~125 characters for social truncations. */
export const siteDescription =
  "Share a frequency plan with the floor: group channels and track what’s deployed by room — no accounts.";
export const ogImageAlt =
  "RForca — crew mark board for live RF deploy tracking";

/** Working production host. */
const LIVE_SITE_URL = "https://rforca.com";
/** Braddcorp subdomain alias. */
export const braddcorpAliasUrl = "https://rforca.braddcorp.com";

function env(name: string): string | undefined {
  const fromImport =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)[name]
      : undefined;
  return (fromImport || process.env[name])?.trim() || undefined;
}

function resolveSiteUrl(): string {
  const fromEnv = (
    env("PUBLIC_SITE_URL") ||
    env("NEXT_PUBLIC_SITE_URL") ||
    ""
  ).replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return LIVE_SITE_URL;
}

export const siteUrl = resolveSiteUrl();

/** Static OG image (Astro cutover — no next/og). */
export const ogImagePath = "/og.png";
export const twitterImagePath = "/og.png";

export const siteKeywords = [
  "RForca",
  "RF Orca",
  "wireless microphone",
  "frequency coordination",
  "Shure Workbench",
  "live production RF",
] as const;
