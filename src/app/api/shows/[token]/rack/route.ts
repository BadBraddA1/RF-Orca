import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { fillRackSlots, setRackLayout } from "@/lib/store";
import {
  MAX_RACK_DIM,
  MIN_RACK_DIM,
  normalizeRackLayout,
} from "@/lib/types";

const bodySchema = z.object({
  cols: z.number().int().min(MIN_RACK_DIM).max(MAX_RACK_DIM).optional(),
  rows: z.number().int().min(MIN_RACK_DIM).max(MAX_RACK_DIM).optional(),
  /** Legacy: total channel count 12/24 maps to a preset layout. */
  rackSize: z.number().int().min(1).max(48).optional(),
  fillEmpty: z.boolean().optional(),
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
    return NextResponse.json({ error: "Invalid rack settings." }, { status: 400 });
  }

  let show = null;
  if (
    parsed.data.cols != null ||
    parsed.data.rows != null ||
    parsed.data.rackSize != null
  ) {
    const layout = normalizeRackLayout({
      cols: parsed.data.cols,
      rows: parsed.data.rows,
      rackSize: parsed.data.rackSize,
    });
    show = await setRackLayout(token, layout.cols, layout.rows);
  }
  if (parsed.data.fillEmpty) {
    show = await fillRackSlots(token);
  }
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}
