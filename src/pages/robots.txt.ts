import type { APIRoute } from "astro";
import { siteUrl } from "@/lib/site-metadata";

export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /
Disallow: /s/
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
