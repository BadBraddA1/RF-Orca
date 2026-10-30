import type { APIRoute } from "astro";
import { isAdminUnlocked } from "@/lib/admin";
import { decodeCsvBytes, parseWwbCsv } from "@/lib/csv";
import { json } from "@/lib/http";
import { replaceChannelsFromImport } from "@/lib/store";

/**
 * POST multipart:
 * - preview=1 (or action=preview): parse only, do not write
 * - otherwise: replace channels (confirm after preview)
 */
export const POST: APIRoute = async ({ params, request, cookies }) => {
  try {
    const token = params.token!;
    if (!(await isAdminUnlocked(token, cookies))) {
      return json({ error: "Admin unlock required." }, 403);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (
      typeof file === "string" ||
      file == null ||
      typeof file.arrayBuffer !== "function"
    ) {
      return json({ error: "CSV file required." }, 400);
    }

    const preview =
      form.get("preview") === "1" ||
      form.get("preview") === "true" ||
      form.get("action") === "preview";

    const filename =
      "name" in file && file.name ? String(file.name) : "import.csv";
    const text = decodeCsvBytes(await file.arrayBuffer());
    const { rows, warnings } = parseWwbCsv(text);
    if (rows.length === 0) {
      return json(
        {
          error:
            "No channels found in file. Use a Workbench Inventory/Coordination CSV export (UTF-8 or UTF-16).",
          warnings,
        },
        400,
      );
    }

    if (preview) {
      return json({
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
        filename,
        csvText: text,
      });
    }

    const show = await replaceChannelsFromImport(token, rows);
    if (!show) {
      return json({ error: "Show not found." }, 404);
    }

    return json({ show, warnings, imported: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    console.error("import failed:", err);
    return json({ error: message }, 500);
  }
};
