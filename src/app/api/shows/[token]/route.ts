import { NextResponse } from "next/server";
import { z } from "zod";
import { getBoardRole, isAdminUnlocked, lockAdmin } from "@/lib/admin";
import { deleteShow, getShowPublic, renameShow } from "@/lib/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const show = await getShowPublic(token);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  const role = await getBoardRole(token);
  return NextResponse.json({
    show,
    admin: role === "admin",
    boLead: role === "boLead" || role === "admin",
  });
}

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Show name required (1–120 characters)." },
      { status: 400 },
    );
  }

  const show = await renameShow(token, parsed.data.name);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}

const deleteBodySchema = z.object({
  /** Must match the show name exactly (case-sensitive) to confirm. */
  confirmName: z.string().min(1),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const show = await getShowPublic(token);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Type the show name to confirm delete." },
      { status: 400 },
    );
  }
  if (parsed.data.confirmName !== show.name) {
    return NextResponse.json(
      { error: "Confirmation name does not match." },
      { status: 400 },
    );
  }

  const ok = await deleteShow(token);
  if (!ok) {
    return NextResponse.json({ error: "Could not delete show." }, { status: 500 });
  }
  await lockAdmin(token);
  return NextResponse.json({ ok: true });
}
