export type ChannelStatus = "allowed" | "blocked" | "unreviewed";

export type Room = {
  id: string;
  name: string;
};

export type Channel = {
  id: string;
  showId: string;
  name: string;
  frequencyMhz: number;
  band: string | null;
  type: string | null;
  groupChannel: string | null;
  zone: string | null;
  isBackup: boolean;
  status: ChannelStatus;
  deployed: boolean;
  roomName: string | null;
  deployedAt: string | null;
  deployedBy: string | null;
  sortOrder: number;
};

export type Show = {
  id: string;
  name: string;
  shareToken: string;
  adminPasswordHash: string;
  rooms: Room[];
  createdAt: string;
};

export type ShowPublic = Omit<Show, "adminPasswordHash"> & {
  channels: Channel[];
  storageMode: "memory" | "turso";
};

export type ParsedChannelRow = {
  name: string;
  frequencyMhz: number;
  band: string | null;
  type: string | null;
  groupChannel: string | null;
  zone: string | null;
  isBackup: boolean;
};
