import { PostHog } from "posthog-node";

function env(name: string): string | undefined {
  const fromImport =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)[name]
      : undefined;
  return (fromImport || process.env[name])?.trim() || undefined;
}

export function PostHogServer() {
  const key =
    env("PUBLIC_POSTHOG_KEY") ||
    env("NEXT_PUBLIC_POSTHOG_KEY") ||
    env("POSTHOG_KEY");
  if (!key) return null;
  return new PostHog(key, {
    host:
      env("PUBLIC_POSTHOG_HOST") ||
      env("NEXT_PUBLIC_POSTHOG_HOST") ||
      env("POSTHOG_HOST") ||
      "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
