import Link from "next/link"
import { BrandLockup } from "@/components/BrandLockup"

export default function NotFound() {
  return (
    <main className="hero" style={{ minHeight: "100dvh" }}>
      <div className="hero-inner">
        <BrandLockup size="header" />
        <p className="tools-whisper" style={{ marginTop: "1.5rem" }}>
          Error 404
        </p>
        <h1
          style={{
            position: "static",
            width: "auto",
            height: "auto",
            clip: "auto",
            overflow: "visible",
            margin: "0.35rem 0 0",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2rem, 5vw, 3rem)",
            letterSpacing: "-0.03em",
          }}
        >
          Frequency not found
        </h1>
        <p className="hero-support">
          That link doesn’t resolve on Orca. Head home to start a show, or open
          a share link you already have.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
          <Link href="/" className="btn-primary">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
