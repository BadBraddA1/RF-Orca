import { NextResponse } from "next/server";
import { ablyConfigured, createShowTokenRequest } from "@/lib/ably";
import { getShowRevision } from "@/lib/store";

/**
 * Ably token auth for a single show channel (+ annotate publish).
 * GET /api/ably-auth?show=<shareToken>&clientId=<id>
 */
export async function GET(request: Request) {
  if (!ablyConfigured()) {
    return NextResponse.json(
      { error: "Ably not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const showToken = url.searchParams.get("show")?.trim();
  if (!showToken) {
    return NextResponse.json(
      { error: "Missing show token." },
      { status: 400 },
    );
  }

  const revision = await getShowRevision(showToken);
  if (revision == null) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }

  const clientId =
    url.searchParams.get("clientId")?.trim() ||
    `orca-${showToken.slice(0, 10)}`;

  try {
    const tokenRequest = await createShowTokenRequest(showToken, clientId);
    return NextResponse.json(tokenRequest);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create Ably token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
