// Typed wrapper over the global `starx` client loaded in index.html, plus the
// wire types shared with services/types.go and services/store.go.

interface Starx {
  init(params: { host: string; port: number; path: string }, cb: () => void): void
  request(route: string, msg: unknown, cb: (data: any) => void): void
  notify(route: string, msg: unknown): void
  on(event: string, fn: (data: any) => void): void
  removeAllListeners(): void
  disconnect(): void
}

declare global {
  interface Window {
    starx: Starx
  }
}

export const PITAYA_HOST = window.location.hostname || '127.0.0.1'
export const PITAYA_PORT = 3250

export const starx = (): Starx => window.starx

// Routes are serverType.component.method; "room" requests are forwarded by
// the connector to one of the room servers.
const route = (method: string) => `room.room.${method}`
export const routes = {
  join: route('join'),
  openGuild: route('openguild'),
  history: route('history'),
  message: route('message'),
  deleteMessage: route('deletemessage'),
  react: route('react'),
  typing: route('typing'),
  createGuild: route('createguild'),
  joinGuild: route('joinguild'),
  leaveGuild: route('leaveguild'),
  deleteGuild: route('deleteguild'),
  createChannel: route('createchannel'),
  deleteChannel: route('deletechannel'),
  setRole: route('setrole'),
  kickMember: route('kickmember'),
  dm: route('dm'),
}

export type Role = 'owner' | 'admin' | 'member'

export const roleRank = (role?: string) => (role === 'owner' ? 3 : role === 'admin' ? 2 : role === 'member' ? 1 : 0)

export interface Guild {
  id: string
  name: string
  icon: string
  ownerId: string
  invite: string
  created: number
  role: Role
}

export interface Channel {
  id: string
  guildId: string
  name: string
  topic: string
  created: number
}

export interface Member {
  name: string
  role: Role
  joined: number
  online?: boolean
}

export interface Message {
  id: string
  guildId: string
  channelId: string
  author: string
  content: string
  mentions?: string[] | null
  reactions?: Record<string, string[]> | null
  server: string
  ts: number
}

export interface Response {
  code: number | string
  result?: string
  msg?: string
}

export interface JoinResponse extends Response {
  name: string
  server: string
  online: string[] | null
  guilds: Guild[] | null
}

export interface GuildDetails extends Response {
  guild: Guild
  channels: Channel[]
  members: Member[]
}

export interface GuildResponse extends Response {
  guild?: Guild
}

export interface HistoryResponse extends Response {
  messages: Message[] | null
  more: boolean
}

export interface DirectMessage {
  from: string
  to: string
  content: string
  server: string
  ts: number
}

export interface Typing {
  guildId: string
  channelId: string
  name: string
}

export interface Presence {
  name: string
  online: boolean
}

export interface MemberEvent {
  guildId: string
  member: Member
}

export interface ChannelEvent {
  guildId: string
  channel: Channel
}

export interface MessageDeleted {
  guildId: string
  channelId: string
  id: string
}

export interface GuildRemoved {
  guildId: string
  reason: string
}

export interface ServerStats {
  id: string
  name: string
  messages: number
  uptime: number
  users: number
}
