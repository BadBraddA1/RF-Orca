import Ably from "ably";

export function ablyConfigured(): boolean {
  return Boolean(process.env.ABLY_API_KEY?.trim());
}

export function showChannelName(shareToken: string): string {
  return `show:${shareToken}`;
}

/** Ephemeral crew markup (FaceTime-style draw) — not persisted. */
export function annotateChannelName(shareToken: string): string {
  return `show:${shareToken}:annotate`;
}

let restClient: Ably.Rest | null = null;

function getRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  if (!restClient) restClient = new Ably.Rest({ key });
  return restClient;
}

/** Issue a TokenRequest so browsers can subscribe (never ship the API key). */
export async function createShowTokenRequest(
  shareToken: string,
  clientId: string,
): Promise<Ably.TokenRequest> {
  const rest = getRest();
  if (!rest) throw new Error("Ably is not configured");
  const channel = showChannelName(shareToken);
  const annotate = annotateChannelName(shareToken);
  const id = clientId.trim() || `orca-${shareToken.slice(0, 10)}`;
  return rest.auth.createTokenRequest({
    clientId: id,
    capability: {
      [channel]: ["subscribe"],
      [annotate]: ["publish", "subscribe"],
    },
    ttl: 60 * 60 * 1000,
  });
}

/** Fire-and-forget board invalidate so other devices refresh immediately. */
export async function publishShowUpdate(
  shareToken: string,
  revision: number,
): Promise<void> {
  const rest = getRest();
  if (!rest) return;
  try {
    await rest.channels.get(showChannelName(shareToken)).publish("update", {
      revision,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ably] publish failed", error);
  }
}
