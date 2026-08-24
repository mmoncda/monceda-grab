import Link from "next/link";

export function SiteHeader() {
  return (
    <nav className="nav shell" aria-label="Main navigation">
      <Link className="brand" href="/" aria-label="Monceda Grab home">
        <span className="brand-mark" aria-hidden="true"><span className="logo-wing logo-wing-left" /><span className="logo-wing logo-wing-right" /><span className="logo-center" /></span>
        <span className="brand-name"><span>MONCEDA</span><b>GRAB</b></span>
      </Link>
      <div className="nav-links">
        <Link href="/#how">How it works</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/about">About</Link>
        <Link href="/privacy">Privacy</Link>
      </div>
      <span className="beta">PUBLIC TOOL</span>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="legal-footer shell site-footer">
      <span>© 2026 Monceda Labs</span>
      <nav aria-label="Footer links">
        <Link href="/guides">Guides</Link><Link href="/about">About</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/copyright">Copyright</Link><a href="mailto:hello@moncedalabs.com">Contact</a>
      </nav>
    </footer>
  );
}
