import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site-metadata"

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy", "/demo"]
  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }))
}
