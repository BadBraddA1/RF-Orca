import Ably from "ably";

export function ablyConfigured(): boolean {
  return Boolean(process.env.ABLY_API_KEY?.trim());
}

export function showChannelName(shareToken: string): string {
  return `show:${shareToken}`;
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
): Promise<Ably.TokenRequest> {
  const rest = getRest();
  if (!rest) throw new Error("Ably is not configured");
  const channel = showChannelName(shareToken);
  return rest.auth.createTokenRequest({
    clientId: `orca-${shareToken.slice(0, 10)}`,
    capability: {
      [channel]: ["subscribe"],
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
