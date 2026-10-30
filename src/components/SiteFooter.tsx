import { siteName } from "@/lib/site-metadata";

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
        <a href="/privacy">Privacy</a>
      </nav>
    </footer>
  );
}

export default SiteFooter;
