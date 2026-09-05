import type { MetadataRoute } from "next";

const SITE_URL = "https://mcbuse.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/privacy", "/terms", "/impressum"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
