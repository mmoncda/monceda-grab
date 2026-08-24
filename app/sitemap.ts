import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://grab.moncedalabs.com";
  const paths = ["/", "/guides", "/guides/how-to-save-your-own-public-media", "/guides/public-links-private-content-and-permission", "/guides/choose-video-quality-and-file-format", "/guides/protect-privacy-when-using-link-tools", "/about", "/privacy", "/terms", "/copyright"];
  return paths.map((path, index) => ({ url: `${base}${path}`, lastModified: new Date("2026-08-22"), changeFrequency: index === 0 ? "weekly" : "monthly", priority: index === 0 ? 1 : path === "/guides" ? 0.8 : 0.7 }));
}
