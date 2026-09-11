/** Stable per-tab Ably client id (unique clients; shared clientId fights connections). */
export function getAblyClientId(): string {
  if (typeof window === "undefined") return `orca-ssr`;
  const key = "rforca.ably.clientId";
  try {
    const existing = sessionStorage.getItem(key)?.trim();
    if (existing) return existing;
    const next = `orca-${crypto.randomUUID().slice(0, 12)}`;
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `orca-${Math.random().toString(36).slice(2, 12)}`;
  }
}
