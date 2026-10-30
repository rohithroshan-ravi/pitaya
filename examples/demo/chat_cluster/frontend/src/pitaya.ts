// Typed wrapper over the global `starx` client loaded in index.html, plus the
// wire types shared with services/types.go.

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
export const routes = {
  join: 'room.room.join',
  message: 'room.room.message',
  typing: 'room.room.typing',
  dm: 'room.room.dm',
  kick: 'room.room.kick',
}

export interface JoinResponse {
  code: number | string
  result?: string
  msg?: string
  name: string
  admin: boolean
  server: string
  users: string[] | null
  channels: string[]
}

export interface Response {
  code: number | string
  result?: string
  msg?: string
}

export interface ChatMessage {
  channel: string
  name: string
  content: string
  server: string
  ts: number
}

export interface DirectMessage {
  from: string
  to: string
  content: string
  server: string
  ts: number
}

export interface Typing {
  channel: string
  name: string
}

export interface UserEvent {
  name: string
  server?: string
}

export interface Notice {
  text: string
}

export interface ServerStats {
  id: string
  name: string
  messages: number
  uptime: number
  users: number
}
