// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('astro').AstroUserConfig} */
export default defineConfig({
  site: "https://rforca.com",
  output: "server",
  adapter: cloudflare({
    imageService: "compile",
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ["PUBLIC_", "NEXT_PUBLIC_", "SENTRY_", "POSTHOG_"],
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
    },
  },
});

