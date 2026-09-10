import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAdminUnlocked,
  lockBoLead,
  unlockBoLead,
} from "@/lib/admin";
import {
  getBoLeadToken,
  regenerateBoLeadToken,
} from "@/lib/store";

const bodySchema = z.object({
  action: z.enum(["unlock", "lock", "regenerate"]).default("unlock"),
  token: z.string().min(1).optional(),
});

function boLeadPath(shareToken: string, leadToken: string): string {
  return `/s/${shareToken}/bo/${leadToken}`;
}

/** Coordinator: read / rotate BO Lead link. Anyone with the secret can unlock. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }
  const leadToken = await getBoLeadToken(token);
  if (!leadToken) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({
    path: boLeadPath(token, leadToken),
    token: leadToken,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (parsed.data.action === "lock") {
    await lockBoLead(token);
    return NextResponse.json({ ok: true, boLead: false });
  }

  if (parsed.data.action === "regenerate") {
    if (!(await isAdminUnlocked(token))) {
      return NextResponse.json(
        { error: "Admin unlock required." },
        { status: 403 },
      );
    }
    const result = await regenerateBoLeadToken(token);
    if (!result) {
      return NextResponse.json({ error: "Show not found." }, { status: 404 });
    }
    await lockBoLead(token);
    return NextResponse.json({
      ok: true,
      show: result.show,
      path: boLeadPath(token, result.boLeadToken),
      token: result.boLeadToken,
    });
  }

  if (!parsed.data.token) {
    return NextResponse.json({ error: "BO Lead token required." }, { status: 400 });
  }

  const ok = await unlockBoLead(token, parsed.data.token);
  if (!ok) {
    return NextResponse.json({ error: "Invalid BO Lead link." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, boLead: true });
}
