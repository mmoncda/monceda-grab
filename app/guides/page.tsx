import type { Metadata } from "next";
import Link from "next/link";
import { guides } from "../guide-content";
import { SiteFooter, SiteHeader } from "../site-chrome";

export const metadata: Metadata = {
  title: "Responsible Media Guides — Monceda Grab",
  description: "Original practical guides about saving public media responsibly, file quality, permission, and privacy.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "Responsible Media Guides — Monceda Grab",
    description: "Practical guidance about ownership, permission, privacy, formats, and responsible media preservation.",
    url: "/guides",
  },
};

export default function GuidesPage() {
  return <main><SiteHeader /><section className="guide-index shell"><span className="kicker">MONCEDA GRAB LIBRARY</span><h1>Practical guides for<br /><em>responsible saving.</em></h1><p className="article-lede">Clear, original guidance about ownership, permission, privacy, and preserving your own public media.</p><div className="guide-grid">{guides.map((guide, index) => <article key={guide.slug}><span>0{index + 1} · {guide.readTime}</span><h2>{guide.title}</h2><p>{guide.description}</p><Link href={`/guides/${guide.slug}`}>Read guide →</Link></article>)}</div></section><SiteFooter /></main>;
}
