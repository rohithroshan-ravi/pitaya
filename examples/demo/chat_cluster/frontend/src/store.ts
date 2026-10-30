import { Channel, DirectMessage, Guild, JoinResponse, Member, Message, ServerStats } from './pitaya'

// A conversation key is a channel ID, or "@user" for a direct message.
export type ConvKey = string

export const dmKey = (user: string): ConvKey => `@${user}`
export const isDM = (key: ConvKey | null) => !!key && key.startsWith('@')

export type Status = 'idle' | 'connecting' | 'online' | 'offline'

export type Item =
  | ({ kind: 'message' } & Message)
  | { kind: 'system'; id: string; text: string; ts: number }

export type HistoryState = 'loading' | 'more' | 'done'

export interface ServerInfo {
  id: string
  name: string
  messages: number
  uptime: number
  rate: number
  lastSeen: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
}

export interface View {
  // null guildId is the direct-messages home
  guildId: string | null
  key: ConvKey | null
}

export interface State {
  status: Status
  me: string
  joinedVia: string
  joinError: string
  guilds: Record<string, Guild>
  guildOrder: string[]
  channels: Record<string, Channel[]>
  members: Record<string, Member[]>
  online: string[]
  items: Record<ConvKey, Item[]>
  history: Record<ConvKey, HistoryState>
  view: View
  lastChannel: Record<string, string>
  keyGuild: Record<ConvKey, string>
  unread: Record<ConvKey, number>
  mentions: Record<ConvKey, number>
  typing: Record<ConvKey, Record<string, number>>
  dms: string[]
  servers: Record<string, ServerInfo>
  toasts: Toast[]
  now: number
}

export const initialState: State = {
  status: 'idle',
  me: '',
  joinedVia: '',
  joinError: '',
  guilds: {},
  guildOrder: [],
  channels: {},
  members: {},
  online: [],
  items: {},
  history: {},
  view: { guildId: null, key: null },
  lastChannel: {},
  keyGuild: {},
  unread: {},
  mentions: {},
  typing: {},
  dms: [],
  servers: {},
  toasts: [],
  now: Date.now(),
}

export type Action =
  | { type: 'connecting' }
  | { type: 'joined'; res: JoinResponse }
  | { type: 'joinFailed'; error: string }
  | { type: 'disconnected' }
  | { type: 'reset' }
  | { type: 'tick'; now: number }
  | { type: 'guildLoaded'; guild: Guild; channels: Channel[]; members: Member[] }
  | { type: 'guildAdded'; guild: Guild }
  | { type: 'guildRemoved'; guildId: string; reason?: string }
  | { type: 'selectGuild'; guildId: string | null }
  | { type: 'selectKey'; key: ConvKey }
  | { type: 'historyLoading'; key: ConvKey }
  | { type: 'history'; key: ConvKey; messages: Message[]; more: boolean }
  | { type: 'message'; msg: Message }
  | { type: 'messageDeleted'; channelId: string; id: string }
  | { type: 'reaction'; msg: Message }
  | { type: 'dm'; msg: DirectMessage }
  | { type: 'system'; key: ConvKey; text: string }
  | { type: 'typing'; key: ConvKey; name: string }
  | { type: 'presence'; name: string; online: boolean }
  | { type: 'memberJoined'; guildId: string; member: Member }
  | { type: 'memberLeft'; guildId: string; name: string }
  | { type: 'memberUpdated'; guildId: string; member: Member }
  | { type: 'channelCreated'; channel: Channel }
  | { type: 'channelDeleted'; channel: Channel }
  | { type: 'stats'; stats: ServerStats }
  | { type: 'toast'; text: string; tone?: Toast['tone'] }
  | { type: 'dismissToast'; id: number }

const MAX_ITEMS = 500
const TYPING_MS = 3000
const SERVER_FORGET_MS = 60_000

let nextId = 0

const byTime = (a: Item, b: Item) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function without<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) return rec
  const { [key]: _, ...rest } = rec
  return rest
}

function isActive(state: State, key: ConvKey) {
  return state.view.key === key && document.visibilityState === 'visible'
}

function appendItem(state: State, key: ConvKey, item: Item, notify: { unread: boolean; mention: boolean }): State {
  const list = state.items[key] ?? []
  if (item.kind === 'message' && list.some((i) => i.id === item.id)) return state
  const next = [...list, item].slice(-MAX_ITEMS)
  let { unread, mentions } = state
  if (!isActive(state, key)) {
    if (notify.unread) unread = { ...unread, [key]: (unread[key] ?? 0) + 1 }
    if (notify.mention) mentions = { ...mentions, [key]: (mentions[key] ?? 0) + 1 }
  }
  return { ...state, items: { ...state.items, [key]: next }, unread, mentions }
}

function system(state: State, key: ConvKey | undefined, text: string): State {
  if (!key) return state
  return appendItem(state, key, { kind: 'system', id: `sys-${nextId++}`, text, ts: Date.now() }, { unread: false, mention: false })
}

function clearTyping(state: State, key: ConvKey, name: string): State {
  const forKey = state.typing[key]
  if (!forKey?.[name]) return state
  return { ...state, typing: { ...state.typing, [key]: without(forKey, name) } }
}

function markRead(state: State, key: ConvKey | null): State {
  if (!key) return state
  return { ...state, unread: without(state.unread, key), mentions: without(state.mentions, key) }
}

function firstChannel(state: State, guildId: string) {
  return state.channels[guildId]?.[0]?.id ?? null
}

function toast(state: State, text: string, tone: Toast['tone'] = 'info'): State {
  return { ...state, toasts: [...state.toasts, { id: nextId++, text, tone }].slice(-4) }
}

const upsertMember = (list: Member[], member: Member) => [...list.filter((m) => m.name !== member.name), member]

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connecting':
      return { ...state, status: 'connecting', joinError: '' }

    case 'joined': {
      const { res } = action
      const guilds = Object.fromEntries((res.guilds ?? []).map((g) => [g.id, g]))
      // Keep the default guild first, then the rest by creation time.
      const guildOrder = (res.guilds ?? [])
        .slice()
        .sort((a, b) => (a.id === 'hq' ? -1 : b.id === 'hq' ? 1 : a.created - b.created))
        .map((g) => g.id)
      const reconnecting = !!state.me
      return {
        ...state,
        status: 'online',
        me: res.name,
        joinedVia: res.server,
        joinError: '',
        online: res.online ?? [],
        guilds,
        guildOrder,
        // Reload guild details and history after a reconnect, since events
        // were missed while offline.
        channels: {},
        members: {},
        history: {},
        view: reconnecting && state.view.guildId && guilds[state.view.guildId] ? state.view : { guildId: guildOrder[0] ?? null, key: null },
      }
    }

    case 'joinFailed':
      return { ...state, status: 'idle', joinError: action.error }

    case 'disconnected':
      if (state.status === 'idle') return state
      if (!state.me) return { ...state, status: 'idle', joinError: 'Cannot reach the server at port 3250' }
      return toast({ ...state, status: 'offline' }, 'Connection lost', 'error')

    case 'reset':
      return { ...initialState, now: Date.now() }

    case 'tick': {
      const typing: State['typing'] = {}
      for (const [key, names] of Object.entries(state.typing)) {
        const alive = Object.fromEntries(Object.entries(names).filter(([, until]) => until > action.now))
        if (Object.keys(alive).length) typing[key] = alive
      }
      const servers = Object.fromEntries(Object.entries(state.servers).filter(([, s]) => action.now - s.lastSeen < SERVER_FORGET_MS))
      return { ...state, typing, servers, now: action.now }
    }

    case 'guildLoaded': {
      const { guild, channels, members } = action
      const keyGuild = { ...state.keyGuild }
      for (const c of channels) keyGuild[c.id] = guild.id
      const next: State = {
        ...state,
        guilds: { ...state.guilds, [guild.id]: guild },
        channels: { ...state.channels, [guild.id]: channels },
        members: { ...state.members, [guild.id]: members },
        keyGuild,
      }
      if (state.view.guildId !== guild.id) return next
      const current = state.view.key && channels.some((c) => c.id === state.view.key) ? state.view.key : null
      const key = current ?? (channels.some((c) => c.id === state.lastChannel[guild.id]) ? state.lastChannel[guild.id] : channels[0]?.id ?? null)
      return markRead({ ...next, view: { guildId: guild.id, key } }, key)
    }

    case 'guildAdded': {
      const { guild } = action
      const guildOrder = state.guildOrder.includes(guild.id) ? state.guildOrder : [...state.guildOrder, guild.id]
      return { ...state, guilds: { ...state.guilds, [guild.id]: guild }, guildOrder }
    }

    case 'guildRemoved': {
      const { guildId, reason } = action
      if (!state.guilds[guildId]) return state
      const keys = new Set((state.channels[guildId] ?? []).map((c) => c.id))
      const keep = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => !keys.has(k)))
      const guildOrder = state.guildOrder.filter((id) => id !== guildId)
      const next: State = {
        ...state,
        guilds: without(state.guilds, guildId),
        guildOrder,
        channels: without(state.channels, guildId),
        members: without(state.members, guildId),
        lastChannel: without(state.lastChannel, guildId),
        items: keep(state.items),
        history: keep(state.history),
        unread: keep(state.unread),
        mentions: keep(state.mentions),
        view: state.view.guildId === guildId ? { guildId: guildOrder[0] ?? null, key: null } : state.view,
      }
      return reason ? toast(next, reason) : next
    }

    case 'selectGuild': {
      const { guildId } = action
      if (guildId === null) return { ...state, view: { guildId: null, key: state.dms[0] ? dmKey(state.dms[0]) : null } }
      const key = state.lastChannel[guildId] ?? firstChannel(state, guildId)
      return markRead({ ...state, view: { guildId, key } }, key)
    }

    case 'selectKey': {
      const { key } = action
      if (isDM(key)) {
        const peer = key.slice(1)
        const dms = state.dms.includes(peer) ? state.dms : [peer, ...state.dms]
        return markRead({ ...state, dms, view: { guildId: null, key } }, key)
      }
      const guildId = state.keyGuild[key] ?? state.view.guildId
      const lastChannel = guildId ? { ...state.lastChannel, [guildId]: key } : state.lastChannel
      return markRead({ ...state, lastChannel, view: { guildId, key } }, key)
    }

    case 'historyLoading':
      return { ...state, history: { ...state.history, [action.key]: 'loading' } }

    case 'history': {
      const { key, messages, more } = action
      const existing = state.items[key] ?? []
      const seen = new Set(existing.map((i) => i.id))
      const older: Item[] = messages.filter((m) => !seen.has(m.id)).map((m) => ({ kind: 'message', ...m }))
      const items = [...older, ...existing].sort(byTime)
      return {
        ...state,
        items: { ...state.items, [key]: items },
        history: { ...state.history, [key]: more ? 'more' : 'done' },
      }
    }

    case 'message': {
      const { msg } = action
      const key = msg.channelId
      const withGuild = { ...state, keyGuild: { ...state.keyGuild, [key]: msg.guildId } }
      const cleared = clearTyping(withGuild, key, msg.author)
      const mine = msg.author === state.me
      return appendItem(cleared, key, { kind: 'message', ...msg }, {
        unread: !mine,
        mention: !mine && !!msg.mentions?.includes(state.me),
      })
    }

    case 'messageDeleted': {
      const list = state.items[action.channelId]
      if (!list) return state
      return { ...state, items: { ...state.items, [action.channelId]: list.filter((i) => i.id !== action.id) } }
    }

    case 'reaction': {
      const { msg } = action
      const list = state.items[msg.channelId]
      if (!list) return state
      return {
        ...state,
        items: { ...state.items, [msg.channelId]: list.map((i) => (i.kind === 'message' && i.id === msg.id ? { ...i, reactions: msg.reactions } : i)) },
      }
    }

    case 'dm': {
      const { msg } = action
      const peer = msg.from === state.me ? msg.to : msg.from
      const key = dmKey(peer)
      const dms = state.dms.includes(peer) ? state.dms : [peer, ...state.dms]
      const item: Item = {
        kind: 'message',
        id: `dm-${nextId++}`,
        guildId: '',
        channelId: key,
        author: msg.from,
        content: msg.content,
        server: msg.server,
        ts: msg.ts,
      }
      const mine = msg.from === state.me
      return appendItem({ ...state, dms }, key, item, { unread: !mine, mention: !mine })
    }

    case 'system':
      return system(state, action.key, action.text)

    case 'typing': {
      if (action.name === state.me) return state
      const forKey = { ...(state.typing[action.key] ?? {}), [action.name]: Date.now() + TYPING_MS }
      return { ...state, typing: { ...state.typing, [action.key]: forKey } }
    }

    case 'presence': {
      const { name, online } = action
      const has = state.online.includes(name)
      if (online === has) return state
      const next = { ...state, online: online ? [...state.online, name] : state.online.filter((u) => u !== name) }
      return !online && state.dms.includes(name) ? system(next, dmKey(name), `${name} went offline`) : next
    }

    case 'memberJoined': {
      const { guildId, member } = action
      const list = state.members[guildId]
      if (!list) return state
      const next = { ...state, members: { ...state.members, [guildId]: upsertMember(list, member) } }
      return member.name === state.me ? next : system(next, firstChannel(state, guildId) ?? undefined, `${member.name} joined the server 👋`)
    }

    case 'memberLeft': {
      const { guildId, name } = action
      const list = state.members[guildId]
      if (!list) return state
      const next = { ...state, members: { ...state.members, [guildId]: list.filter((m) => m.name !== name) } }
      return system(next, firstChannel(state, guildId) ?? undefined, `${name} left the server`)
    }

    case 'memberUpdated': {
      const { guildId, member } = action
      let next = state
      const list = state.members[guildId]
      if (list) next = { ...next, members: { ...next.members, [guildId]: upsertMember(list, member) } }
      const guild = state.guilds[guildId]
      if (member.name === state.me && guild) {
        next = toast({ ...next, guilds: { ...next.guilds, [guildId]: { ...guild, role: member.role } } }, `You are now ${member.role === 'admin' ? 'an admin' : 'a member'} of ${guild.name}`)
      }
      return next
    }

    case 'channelCreated': {
      const { channel } = action
      const list = state.channels[channel.guildId]
      if (!list || list.some((c) => c.id === channel.id)) return state
      return {
        ...state,
        channels: { ...state.channels, [channel.guildId]: [...list, channel] },
        keyGuild: { ...state.keyGuild, [channel.id]: channel.guildId },
      }
    }

    case 'channelDeleted': {
      const { channel } = action
      const list = state.channels[channel.guildId]
      if (!list) return state
      const channels = list.filter((c) => c.id !== channel.id)
      const next: State = {
        ...state,
        channels: { ...state.channels, [channel.guildId]: channels },
        items: without(state.items, channel.id),
        unread: without(state.unread, channel.id),
        mentions: without(state.mentions, channel.id),
      }
      if (state.view.key !== channel.id) return next
      return toast({ ...next, view: { guildId: channel.guildId, key: channels[0]?.id ?? null } }, `#${channel.name} was deleted`)
    }

    case 'stats': {
      const { stats } = action
      const now = Date.now()
      const prev = state.servers[stats.id]
      const rate = prev ? Math.max(0, stats.messages - prev.messages) / Math.max(0.5, (now - prev.lastSeen) / 1000) : 0
      const info: ServerInfo = { id: stats.id, name: stats.name, messages: stats.messages, uptime: stats.uptime, rate, lastSeen: now }
      return { ...state, servers: { ...state.servers, [stats.id]: info } }
    }

    case 'toast':
      return toast(state, action.text, action.tone)

    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
  }
}
