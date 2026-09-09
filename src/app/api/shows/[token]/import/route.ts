import { NextResponse } from "next/server";
import { isAdminUnlocked } from "@/lib/admin";
import { decodeCsvBytes, parseWwbCsv } from "@/lib/csv";
import { replaceChannelsFromImport } from "@/lib/store";

/**
 * POST multipart:
 * - preview=1 (or action=preview): parse only, do not write
 * - otherwise: replace channels (confirm after preview)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await isAdminUnlocked(token))) {
    return NextResponse.json({ error: "Admin unlock required." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  }

  const preview =
    form.get("preview") === "1" ||
    form.get("preview") === "true" ||
    form.get("action") === "preview";

  const text = decodeCsvBytes(await file.arrayBuffer());
  const { rows, warnings } = parseWwbCsv(text);
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No channels found in file. Use a Workbench Inventory/Coordination CSV export (UTF-8 or UTF-16).",
        warnings,
      },
      { status: 400 },
    );
  }

  if (preview) {
    return NextResponse.json({
      preview: true,
      warnings,
      count: rows.length,
      rows: rows.slice(0, 80).map((r) => ({
        name: r.name,
        frequencyMhz: r.frequencyMhz,
        band: r.band,
        zone: r.zone,
        isBackup: r.isBackup,
        groupChannel: r.groupChannel,
      })),
      truncated: rows.length > 80,
      filename: file.name,
      csvText: text,
    });
  }

  const show = await replaceChannelsFromImport(token, rows);
  if (!show) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }

  return NextResponse.json({ show, warnings, imported: rows.length });
}
