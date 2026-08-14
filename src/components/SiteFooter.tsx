import Link from "next/link"
import { siteName } from "@/lib/site-metadata"

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>{siteName}</span>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
      </nav>
    </footer>
  )
}
