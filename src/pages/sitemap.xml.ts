import type { APIRoute } from "astro";
import { siteUrl } from "@/lib/site-metadata";

export const GET: APIRoute = () => {
  const urls = ["", "/demo", "/privacy"].map(
    (path) => `  <url><loc>${siteUrl}${path || "/"}</loc></url>`,
  );
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
