import { NextResponse } from "next/server";
import { isAdminUnlocked } from "@/lib/admin";
import { getShowPublic } from "@/lib/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const show = await getShowPublic(token);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  const admin = await isAdminUnlocked(token);
  return NextResponse.json({ show, admin });
}
