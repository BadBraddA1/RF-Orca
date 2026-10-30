import { defineMiddleware } from "astro:middleware";

/**
 * Copy Cloudflare Worker bindings/secrets onto process.env so existing
 * lib code (Turso, Ably, PostHog) keeps using process.env.*.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const runtime = (
    context.locals as {
      runtime?: { env?: Record<string, unknown> };
    }
  ).runtime;
  const env = runtime?.env;
  if (env && typeof process !== "undefined" && process.env) {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string" && process.env[key] == null) {
        process.env[key] = value;
      }
    }
  }
  return next();
});
