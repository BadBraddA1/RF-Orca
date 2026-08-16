import type { Channel, ShowPublic } from "./types";

/** CSV snapshot of the mark board for post-show / client handoff. */
export function buildShowExportCsv(show: ShowPublic): string {
  const headers = [
    "name",
    "frequency_mhz",
    "band",
    "group",
    "group_channel",
    "status",
    "deployed",
    "room",
    "assigned_to",
    "deployed_at",
    "backup",
  ];
  const lines = [headers.join(",")];
  for (const ch of show.channels) {
    lines.push(
      [
        csv(ch.name),
        ch.frequencyMhz.toFixed(3),
        csv(ch.band),
        csv(ch.groupName),
        csv(ch.groupChannel),
        ch.status,
        ch.deployed ? "yes" : "no",
        csv(ch.roomName),
        csv(ch.assignedTo),
        csv(ch.deployedAt),
        ch.isBackup ? "yes" : "no",
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csv(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadShowCsv(show: ShowPublic): void {
  const blob = new Blob([buildShowExportCsv(show)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(show.name)}-orca-snapshot.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "show"
  );
}

export function channelMatchesQuery(ch: Channel, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const freq = ch.frequencyMhz.toFixed(3);
  const hay = [
    ch.name,
    freq,
    ch.band,
    ch.groupName,
    ch.groupChannel,
    ch.roomName,
    ch.assignedTo,
    ch.zone,
    ch.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}
