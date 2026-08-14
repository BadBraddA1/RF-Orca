import { ImageResponse } from "next/og"
import { loadOgLogoDataUrl } from "@/lib/og-logo"
import { ogImageAlt, siteName, siteUrl } from "@/lib/site-metadata"

export const alt = ogImageAlt
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const runtime = "nodejs"

export default async function Image() {
  const host = new URL(siteUrl).host
  const logoSrc = await loadOgLogoDataUrl()

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 48,
          padding: "48px 64px",
          background:
            "linear-gradient(155deg, #06101f 0%, #0a1a30 55%, #071526 100%)",
          color: "#e8f0ff",
        }}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            width={280}
            height={280}
            alt=""
            style={{ objectFit: "contain" }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 700,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {siteName}
          </div>
          <div style={{ fontSize: 28, color: "#38d6f2", fontWeight: 600 }}>
            Radio Frequency Orchestrator
          </div>
          <div style={{ fontSize: 24, color: "#b6c5de", lineHeight: 1.35 }}>
            Share Workbench plans. Group channels. Track what’s deployed.
          </div>
          <div style={{ marginTop: 8, fontSize: 20, color: "#ff9a4a" }}>
            {host}
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
