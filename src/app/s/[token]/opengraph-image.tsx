import { ImageResponse } from "next/og"
import { loadOgLogoDataUrl } from "@/lib/og-logo"
import { siteName, siteUrl } from "@/lib/site-metadata"
import { getShowPublic } from "@/lib/store"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const runtime = "nodejs"
export const alt = "RF Orca show board"

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const show = await getShowPublic(token)
  const host = new URL(siteUrl).host
  const logoSrc = await loadOgLogoDataUrl()

  const title = show?.name?.trim() || "RF show"
  const channels = show?.channels ?? []
  const deployed = channels.filter((c) => c.deployed).length
  const total = channels.length
  const groups = show?.features.groups
    ? new Set(channels.map((c) => c.groupName).filter(Boolean)).size
    : 0
  const locked = show?.features.crewLocked

  const stats: string[] = []
  if (total > 0) {
    stats.push(`${deployed}/${total} deployed`)
  } else {
    stats.push("No channels yet")
  }
  if (groups > 0) stats.push(`${groups} groups`)
  if (locked) stats.push("Board locked")

  const subtitle = stats.join(" · ")

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
          gap: 44,
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
            width={240}
            height={240}
            alt=""
            style={{ objectFit: "contain" }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 760,
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#38d6f2",
            }}
          >
            {siteName} · Mark board
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 28 ? 52 : 64,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {title.length > 48 ? `${title.slice(0, 45)}…` : title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#b6c5de",
              lineHeight: 1.3,
            }}
          >
            {subtitle}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 22,
              color: "#ff9a4a",
            }}
          >
            {host}/s/…
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
