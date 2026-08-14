import Link from "next/link"
import { siteName } from "@/lib/site-metadata"

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>
        {siteName}
        <span className="footer-sep"> · </span>
        <a href="https://braddcorp.com" target="_blank" rel="noreferrer">
          Powered by Braddcorp
        </a>
      </span>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
      </nav>
    </footer>
  )
}
