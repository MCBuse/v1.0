import type { MetadataRoute } from "next";

const SITE_URL = "https://mcbuse.com";

const ROUTES = [
  { path: "/", priority: 1 },
  { path: "/product", priority: 0.9 },
  { path: "/merchants", priority: 0.9 },
  { path: "/partners", priority: 0.9 },
  { path: "/roadmap", priority: 0.7 },
  { path: "/demo", priority: 0.7 },
  { path: "/contact", priority: 0.8 },
  { path: "/company", priority: 0.6 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
  { path: "/impressum", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: route.priority,
  }));
}
