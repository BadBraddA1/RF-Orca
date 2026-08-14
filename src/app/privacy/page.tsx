import type { Metadata } from "next"
import Link from "next/link"
import { BrandLockup } from "@/components/BrandLockup"
import { siteName, siteUrl } from "@/lib/site-metadata"

export const metadata: Metadata = {
  title: "Privacy",
  description: `Privacy notes for ${siteName}.`,
}

export default function PrivacyPage() {
  return (
    <main className="board" style={{ maxWidth: "40rem" }}>
      <BrandLockup size="header" showTagline />
      <h1
        style={{
          margin: "1rem 0 0",
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
        }}
      >
        Privacy
      </h1>
      <div className="hero-support" style={{ display: "grid", gap: "0.9rem" }}>
        <p>
          {siteName} stores show data you create (show name, channels,
          rooms/groups, deploy marks) so crews can share a mark board. Admin
          passwords are stored hashed, not in plain text.
        </p>
        <p>
          Share links are unguessable tokens. Anyone with a link can view and
          update deploy/room marks for that show. Coordinator tools require the
          admin password set when the show was created.
        </p>
        <p>
          Hosting is on Vercel; durable data uses Turso when configured. We don’t
          sell personal data. Contact the show coordinator if you need a show
          removed.
        </p>
        <p>
          Site:{" "}
          <a href={siteUrl} style={{ color: "var(--sea-bright)" }}>
            {siteUrl.replace(/^https?:\/\//, "")}
          </a>
        </p>
      </div>
      <Link href="/" className="btn-ghost" style={{ width: "fit-content" }}>
        ← Home
      </Link>
    </main>
  )
}
