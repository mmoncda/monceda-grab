import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://grab.moncedalabs.com/sitemap.xml",
    host: "https://grab.moncedalabs.com",
  };
}
