import { NextResponse } from "next/server";
import { ablyConfigured, createShowTokenRequest } from "@/lib/ably";
import { getShowRevision } from "@/lib/store";

/**
 * Ably token auth for a single show channel.
 * GET /api/ably-auth?show=<shareToken>
 */
export async function GET(request: Request) {
  if (!ablyConfigured()) {
    return NextResponse.json(
      { error: "Ably not configured." },
      { status: 503 },
    );
  }

  const showToken = new URL(request.url).searchParams.get("show")?.trim();
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

  try {
    const tokenRequest = await createShowTokenRequest(showToken);
    return NextResponse.json(tokenRequest);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create Ably token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
