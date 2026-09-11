import { NextResponse } from "next/server";
import { z } from "zod";
import { pingChannel } from "@/lib/store";

const bodySchema = z.object({
  channelId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ping." }, { status: 400 });
  }

  const show = await pingChannel(token, parsed.data.channelId);
  if (!show) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  return NextResponse.json({ show });
}
