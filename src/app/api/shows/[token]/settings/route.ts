import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { updateDeployGroup, updateShowFeatures } from "@/lib/store";

const bodySchema = z.object({
  deploy: z.boolean().optional(),
  rooms: z.boolean().optional(),
  assignments: z.boolean().optional(),
  groups: z.boolean().optional(),
  status: z.boolean().optional(),
  lockDeployed: z.boolean().optional(),
  lockStaged: z.boolean().optional(),
  crewLocked: z.boolean().optional(),
  /** null clears; omit leaves unchanged */
  deployGroupName: z.string().max(80).nullable().optional(),
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

  const { deployGroupName, ...featurePatch } = parsed.data;
  const hasFeatures = Object.keys(featurePatch).length > 0;

  let show = null;
  if (hasFeatures) {
    show = await updateShowFeatures(token, featurePatch);
    if (!show) {
      return NextResponse.json({ error: "Show not found." }, { status: 404 });
    }
  }

  if (deployGroupName !== undefined) {
    show = await updateDeployGroup(token, deployGroupName);
    if (!show) {
      return NextResponse.json({ error: "Show not found." }, { status: 404 });
    }
  }

  if (!show) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  return NextResponse.json({ show });
}
