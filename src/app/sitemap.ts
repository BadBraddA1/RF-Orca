import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site-metadata"

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy"]
  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }))
}
