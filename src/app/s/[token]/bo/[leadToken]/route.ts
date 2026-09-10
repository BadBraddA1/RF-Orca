import { NextResponse } from "next/server";
import { unlockBoLead } from "@/lib/admin";

/**
 * Claim BO Lead privileges via the secret link the coordinator shared.
 * Sets an httpOnly cookie and redirects to the show mark board.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; leadToken: string }> },
) {
  const { token, leadToken } = await context.params;
  const ok = await unlockBoLead(token, leadToken);
  const dest = new URL(`/s/${token}`, request.url);
  if (!ok) {
    dest.searchParams.set("bo", "invalid");
    return NextResponse.redirect(dest);
  }
  dest.searchParams.set("bo", "1");
  return NextResponse.redirect(dest);
}
