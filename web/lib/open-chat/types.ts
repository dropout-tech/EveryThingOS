/** Open Chat is one inbox for LINE, IG, FB and the site widget. It is not a LINE OpenChat group. */

export type OpenChannel = "line" | "ig" | "fb" | "web";

export type OpenThread = {
  id: string;
  name: string;
  handle: string;
  channel: OpenChannel;
  preview: string;
  /** Minutes since the guest's last message. Oldest (largest) waits first. */
  waitedMinutes: number;
  stage: string;
  bought: string;
  owed: string;
  email?: string;
  phone?: string;
};

export type ChannelFact = {
  id: OpenChannel | "keyword";
  label: string;
  /** The separate product a Taiwan shop would otherwise keep open. */
  replaces: string;
  note: string;
};

export type PersonRef = {
  name: string;
  email?: string;
  phone?: string;
};
