import Papa from "papaparse";
import type { ParsedChannelRow } from "./types";

function parseFrequency(raw: string): number | null {
  const cleaned = raw.replace(/mhz/i, "").replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function pick(
  row: Record<string, string>,
  aliases: string[],
): string | null {
  for (const alias of aliases) {
    const key = Object.keys(row).find((k) => normalizeHeader(k) === alias);
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return null;
}

/**
 * Workbench / Excel often save "CSV" as UTF-16 (with or without BOM).
 * `File.text()` / UTF-8 decode turns those into garbage with no frequencies.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf);
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf);
  }
  // UTF-16LE without BOM: lots of NUL bytes in the first line
  const sample = buf.subarray(0, Math.min(buf.length, 200));
  let nuls = 0;
  for (const b of sample) if (b === 0) nuls += 1;
  if (sample.length > 20 && nuls > sample.length / 4) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  return new TextDecoder("utf-8").decode(buf);
}

function detectDelimiter(text: string): string {
  const first = (text.split(/\r?\n/).find((l) => l.trim()) ?? "").slice(0, 400);
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return "\t";
  if (semis > commas && semis >= tabs) return ";";
  return ",";
}

/**
 * Parses Shure WWB inventory / coordination-style CSV exports.
 * Tolerates section header rows (Primary/Backup/zone labels).
 */
export function parseWwbCsv(text: string): {
  rows: ParsedChannelRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  let currentZone: string | null = null;
  let currentIsBackup = false;

  // Strip leftover BOM after decode
  const cleaned = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleaned);

  const parsed = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length) {
    warnings.push(
      ...parsed.errors.slice(0, 5).map((e) => e.message || "CSV parse issue"),
    );
  }

  const rows: ParsedChannelRow[] = [];
  const data = parsed.data;

  // If headers didn't look right, try scanning raw lines for section markers
  // and rebuild with flexible column detection.
  for (const row of data) {
    const values = Object.values(row).map((v) => (v ?? "").trim());
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    // Section / zone markers often land in the first cell only
    const first = nonEmpty[0] ?? "";
    const firstLower = first.toLowerCase();
    if (
      nonEmpty.length === 1 ||
      (nonEmpty.length <= 2 &&
        (firstLower.includes("primary") ||
          firstLower.includes("backup") ||
          firstLower.includes("zone") ||
          firstLower.includes("frequencies")))
    ) {
      if (firstLower.includes("backup")) currentIsBackup = true;
      if (firstLower.includes("primary")) currentIsBackup = false;
      if (!firstLower.includes("frequencies")) {
        currentZone = first.replace(/[:\-–].*$/, "").trim() || currentZone;
      }
      continue;
    }

    const freqRaw =
      pick(row, [
        "frequency",
        "freq",
        "frequency (mhz)",
        "freq mhz",
        "frequency mhz",
        "tx frequency",
        "rf frequency",
      ]) ??
      values.find((v) => /\d+(\.\d+)?/.test(v) && /mhz|\d{3}/i.test(v)) ??
      null;

    if (!freqRaw) continue;
    const frequencyMhz = parseFrequency(freqRaw);
    if (frequencyMhz == null) continue;

    const name =
      pick(row, [
        "channel name",
        "name",
        "channel",
        "label",
        "device name",
        "transmitter name",
      ]) ?? `CH ${frequencyMhz.toFixed(3)}`;

    rows.push({
      name,
      frequencyMhz,
      band: pick(row, ["band"]),
      type: pick(row, ["type"]),
      groupChannel: pick(row, [
        "group & channel",
        "group and channel",
        "group/channel",
        "g & ch",
        "group",
      ]),
      zone: currentZone,
      isBackup: currentIsBackup,
    });
  }

  // Fallback: bare frequency list (one MHz value per line / comma-separated)
  if (rows.length === 0) {
    const bare = cleaned
      .split(/[\n,;\t]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of bare) {
      const frequencyMhz = parseFrequency(part);
      if (frequencyMhz == null) continue;
      rows.push({
        name: `CH ${frequencyMhz.toFixed(3)}`,
        frequencyMhz,
        band: null,
        type: null,
        groupChannel: null,
        zone: null,
        isBackup: false,
      });
    }
    if (rows.length) {
      warnings.push("Parsed as bare frequency list (no channel names found).");
    }
  }

  if (rows.length === 0) {
    warnings.push(
      "No frequency rows found. Export Inventory or Coordination as CSV from Workbench (not a .wwb project file).",
    );
  }

  return { rows, warnings };
}
