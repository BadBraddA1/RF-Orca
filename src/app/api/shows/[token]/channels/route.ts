import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { addManualChannel } from "@/lib/store";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  frequencyMhz: z.number().positive().max(10000),
  groupName: z.string().trim().min(1).max(80).nullable().optional(),
  band: z.string().trim().min(1).max(80).nullable().optional(),
});

/** Add a channel by hand when there’s no Workbench CSV for this show. */
export async function POST(
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
    return NextResponse.json(
      { error: "Need a channel name and frequency (MHz)." },
      { status: 400 },
    );
  }

  const show = await addManualChannel(token, {
    name: parsed.data.name,
    frequencyMhz: parsed.data.frequencyMhz,
    groupName: parsed.data.groupName ?? null,
    band: parsed.data.band ?? null,
  });
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}
