import { findFreqConflicts } from "@/lib/board-helpers"
import type {
  ActivityEvent,
  Channel,
  ShowPublic,
} from "@/lib/types"
import { DEFAULT_SHOW_FEATURES } from "@/lib/types"

const SHOW_ID = "show_demo"
let idSeq = 0
function demoId(prefix: string): string {
  idSeq += 1
  return `${prefix}_demo_${idSeq}_${Math.random().toString(36).slice(2, 8)}`
}

const NOW = () => new Date().toISOString()

type SeedChannel = {
  name: string
  frequencyMhz: number
  band: string
  groupName: string
  groupChannel?: string
  assignedTo?: string
  isBackup?: boolean
  status?: Channel["status"]
}

const SEED: SeedChannel[] = [
  { name: "Lead Vocal", frequencyMhz: 518.125, band: "G50", groupName: "Vocals", groupChannel: "1/1", assignedTo: "Maya Chen", status: "allowed" },
  { name: "BGV 1", frequencyMhz: 520.250, band: "G50", groupName: "Vocals", groupChannel: "1/2", assignedTo: "Jordan Lee", status: "allowed" },
  { name: "BGV 2", frequencyMhz: 522.500, band: "G50", groupName: "Vocals", groupChannel: "1/3", status: "allowed" },
  { name: "Pastor Mic", frequencyMhz: 524.750, band: "G50", groupName: "Vocals", groupChannel: "1/4", assignedTo: "Pastor Kim", status: "allowed" },
  { name: "IEM Mix A", frequencyMhz: 556.000, band: "H50", groupName: "IEMs", groupChannel: "2/1", assignedTo: "Maya Chen", status: "allowed" },
  { name: "IEM Mix B", frequencyMhz: 558.250, band: "H50", groupName: "IEMs", groupChannel: "2/2", assignedTo: "Jordan Lee", status: "allowed" },
  { name: "IEM Mix C", frequencyMhz: 560.500, band: "H50", groupName: "IEMs", groupChannel: "2/3", status: "unreviewed" },
  { name: "Comms Lead", frequencyMhz: 464.550, band: "J50", groupName: "Comms", groupChannel: "3/1", assignedTo: "A2 Desk", status: "allowed" },
  { name: "Comms Stage", frequencyMhz: 464.550, band: "J50", groupName: "Comms", groupChannel: "3/2", status: "allowed" }, // same freq — conflict later
  { name: "Spare Handheld", frequencyMhz: 530.000, band: "G50", groupName: "Vocals", isBackup: true, status: "blocked" },
]

function makeChannel(seed: SeedChannel, index: number): Channel {
  return {
    id: demoId("ch"),
    showId: SHOW_ID,
    name: seed.name,
    frequencyMhz: seed.frequencyMhz,
    band: seed.band,
    type: seed.isBackup ? "Backup" : "Primary",
    groupChannel: seed.groupChannel ?? null,
    zone: seed.groupName,
    groupName: seed.groupName,
    isBackup: Boolean(seed.isBackup),
    status: seed.status ?? "unreviewed",
    deployed: false,
    roomName: null,
    assignedTo: seed.assignedTo ?? null,
    deployedAt: null,
    deployedBy: null,
    sortOrder: index,
  }
}

export function buildDemoShow(): ShowPublic {
  const channels = SEED.map(makeChannel)
  return {
    id: SHOW_ID,
    name: "Ballroom Saturday (Demo)",
    shareToken: "demo",
    rooms: [
      { id: "room_a", name: "Ballroom A" },
      { id: "room_b", name: "Ballroom B" },
      { id: "room_g", name: "Green Room" },
    ],
    groups: [
      { id: "grp_v", name: "Vocals" },
      { id: "grp_i", name: "IEMs" },
      { id: "grp_c", name: "Comms" },
    ],
    features: { ...DEFAULT_SHOW_FEATURES },
    revision: 1,
    activity: [
      {
        id: demoId("act"),
        at: NOW(),
        kind: "import",
        message: "Imported 10 channels from Workbench CSV",
      },
    ],
    createdAt: NOW(),
    channels,
    storageMode: "memory",
    conflicts: [],
  }
}

export function pushActivity(
  show: ShowPublic,
  kind: ActivityEvent["kind"],
  message: string,
  channelId?: string | null,
): ShowPublic {
  const entry: ActivityEvent = {
    id: demoId("act"),
    at: NOW(),
    kind,
    message,
    channelId: channelId ?? null,
  }
  return {
    ...show,
    revision: show.revision + 1,
    activity: [entry, ...show.activity].slice(0, 40),
    conflicts: findFreqConflicts(show.channels),
  }
}

export function patchDemoChannel(
  show: ShowPublic,
  channelId: string,
  patch: Partial<Pick<Channel, "deployed" | "roomName" | "status" | "assignedTo">>,
  activityMessage?: string,
): ShowPublic {
  const channels = show.channels.map((ch) => {
    if (ch.id !== channelId) return ch
    const next = { ...ch, ...patch }
    if (patch.deployed === true) {
      next.deployedAt = NOW()
      next.deployedBy = "Demo A2"
    }
    if (patch.deployed === false) {
      next.deployedAt = null
      next.deployedBy = null
      next.roomName = null
    }
    return next
  })
  let nextShow: ShowPublic = {
    ...show,
    channels,
    conflicts: findFreqConflicts(channels),
  }
  if (activityMessage) {
    const kind =
      patch.assignedTo !== undefined &&
      patch.deployed === undefined &&
      patch.status === undefined
        ? "assign"
        : patch.deployed === false
          ? "undeploy"
          : patch.deployed
            ? "deploy"
            : "status"
    nextShow = pushActivity(nextShow, kind, activityMessage, channelId)
  } else {
    nextShow = { ...nextShow, revision: show.revision + 1 }
  }
  return nextShow
}

export type DemoBeat = {
  delayMs: number
  label: string
  run: (show: ShowPublic) => ShowPublic
}

/** Scripted walkthrough of the board features. */
export function buildDemoBeats(): DemoBeat[] {
  return [
    {
      delayMs: 900,
      label: "Allow remaining IEM",
      run: (show) => {
        const ch = show.channels.find((c) => c.name === "IEM Mix C")
        if (!ch) return show
        return patchDemoChannel(
          show,
          ch.id,
          { status: "allowed" },
          `Set ${ch.name} → allowed`,
        )
      },
    },
    {
      delayMs: 1100,
      label: "Assign BGV 2 pack",
      run: (show) => {
        const ch = show.channels.find((c) => c.name === "BGV 2")
        if (!ch) return show
        return patchDemoChannel(
          show,
          ch.id,
          { assignedTo: "Sam Rivera" },
          `${ch.name} → Sam Rivera`,
        )
      },
    },
    {
      delayMs: 1400,
      label: "Deploy Lead Vocal",
      run: (show) => {
        const ch = show.channels.find((c) => c.name === "Lead Vocal")
        if (!ch) return show
        return patchDemoChannel(
          show,
          ch.id,
          { deployed: true, roomName: "Ballroom A" },
          `Deployed ${ch.name} → Ballroom A`,
        )
      },
    },
    {
      delayMs: 1200,
      label: "Deploy BGVs",
      run: (show) => {
        let next = show
        for (const name of ["BGV 1", "BGV 2"]) {
          const ch = next.channels.find((c) => c.name === name)
          if (!ch) continue
          next = patchDemoChannel(
            next,
            ch.id,
            { deployed: true, roomName: "Ballroom A" },
            `Deployed ${ch.name} → Ballroom A`,
          )
        }
        return next
      },
    },
    {
      delayMs: 1300,
      label: "Deploy IEMs",
      run: (show) => {
        let next = show
        for (const name of ["IEM Mix A", "IEM Mix B", "IEM Mix C"]) {
          const ch = next.channels.find((c) => c.name === name)
          if (!ch) continue
          next = patchDemoChannel(
            next,
            ch.id,
            { deployed: true, roomName: "Green Room" },
            `Deployed ${ch.name} → Green Room`,
          )
        }
        return next
      },
    },
    {
      delayMs: 1400,
      label: "Comms — same freq, two rooms (conflict)",
      run: (show) => {
        let next = show
        const lead = next.channels.find((c) => c.name === "Comms Lead")
        const stage = next.channels.find((c) => c.name === "Comms Stage")
        if (lead) {
          next = patchDemoChannel(
            next,
            lead.id,
            { deployed: true, roomName: "Ballroom A" },
            `Deployed ${lead.name} → Ballroom A`,
          )
        }
        if (stage) {
          next = patchDemoChannel(
            next,
            stage.id,
            { deployed: true, roomName: "Ballroom B" },
            `Deployed ${stage.name} → Ballroom B`,
          )
        }
        return next
      },
    },
    {
      delayMs: 1600,
      label: "Pastor mic to Ballroom B",
      run: (show) => {
        const ch = show.channels.find((c) => c.name === "Pastor Mic")
        if (!ch) return show
        return patchDemoChannel(
          show,
          ch.id,
          { deployed: true, roomName: "Ballroom B" },
          `Deployed ${ch.name} → Ballroom B`,
        )
      },
    },
    {
      delayMs: 1800,
      label: "Lock board for crew",
      run: (show) =>
        pushActivity(
          {
            ...show,
            features: { ...show.features, crewLocked: true },
            revision: show.revision + 1,
          },
          "settings",
          "Locked board for crew",
        ),
    },
    {
      delayMs: 2200,
      label: "Unlock board",
      run: (show) =>
        pushActivity(
          {
            ...show,
            features: { ...show.features, crewLocked: false },
            revision: show.revision + 1,
          },
          "settings",
          "Unlocked board for crew",
        ),
    },
  ]
}
