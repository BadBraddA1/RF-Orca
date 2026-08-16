import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { updateShowFeatures } from "@/lib/store";

const bodySchema = z.object({
  deploy: z.boolean().optional(),
  rooms: z.boolean().optional(),
  assignments: z.boolean().optional(),
  groups: z.boolean().optional(),
  status: z.boolean().optional(),
  lockDeployed: z.boolean().optional(),
  crewLocked: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  }

  const show = await updateShowFeatures(token, parsed.data);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}
