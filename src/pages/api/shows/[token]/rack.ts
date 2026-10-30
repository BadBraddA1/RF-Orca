import type { APIRoute } from "astro";
import { z } from "zod";
import { isAdminUnlocked } from "@/lib/admin";
import { json } from "@/lib/http";
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

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const token = params.token!;
  if (!(await isAdminUnlocked(token, cookies))) {
    return json({ error: "Admin unlock required." }, 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid rack settings." }, 400);
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
    return json({ error: "Show not found." }, 404);
  }
  return json({ show });
};
