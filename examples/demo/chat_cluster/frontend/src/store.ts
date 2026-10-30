import { ChatMessage, DirectMessage, JoinResponse, ServerStats } from './pitaya'

// A conversation key is "#channel" or "@user".
export type ConvKey = string

export const channelKey = (channel: string): ConvKey => `#${channel}`
export const dmKey = (user: string): ConvKey => `@${user}`

export type Status = 'idle' | 'connecting' | 'online' | 'offline' | 'kicked'

export type Item =
  | { id: number; kind: 'message'; from: string; content: string; server: string; ts: number }
  | { id: number; kind: 'system'; text: string; ts: number }

type NewItem = Item extends infer T ? (T extends Item ? Omit<T, 'id'> : never) : never

export interface ServerInfo {
  id: string
  name: string
  messages: number
  uptime: number
  rate: number
  history: number[]
  lastSeen: number
}

export interface State {
  status: Status
  me: string
  admin: boolean
  joinedVia: string
  joinError: string
  kickedBy: string
  channels: string[]
  users: string[]
  convs: Record<ConvKey, Item[]>
  dms: string[]
  active: ConvKey
  unread: Record<ConvKey, number>
  typing: Record<ConvKey, Record<string, number>>
  servers: Record<string, ServerInfo>
  now: number
}

export const initialState: State = {
  status: 'idle',
  me: '',
  admin: false,
  joinedVia: '',
  joinError: '',
  kickedBy: '',
  channels: [],
  users: [],
  convs: {},
  dms: [],
  active: '#general',
  unread: {},
  typing: {},
  servers: {},
  now: Date.now(),
}

export type Action =
  | { type: 'connecting' }
  | { type: 'joined'; res: JoinResponse }
  | { type: 'joinFailed'; error: string }
  | { type: 'message'; msg: ChatMessage }
  | { type: 'dm'; msg: DirectMessage }
  | { type: 'system'; key: ConvKey; text: string }
  | { type: 'userJoined'; name: string }
  | { type: 'userLeft'; name: string }
  | { type: 'typing'; key: ConvKey; name: string }
  | { type: 'stats'; stats: ServerStats }
  | { type: 'select'; key: ConvKey }
  | { type: 'disconnected' }
  | { type: 'kicked'; by: string }
  | { type: 'tick'; now: number }
  | { type: 'reset' }

const MAX_ITEMS = 300
const TYPING_MS = 3000
const SERVER_FORGET_MS = 60_000
const HISTORY = 30

let nextId = 0

function append(state: State, key: ConvKey, item: NewItem): State {
  const list = [...(state.convs[key] ?? []), { ...item, id: nextId++ }].slice(-MAX_ITEMS)
  const unread = key === state.active ? state.unread : { ...state.unread, [key]: (state.unread[key] ?? 0) + 1 }
  return { ...state, convs: { ...state.convs, [key]: list }, unread }
}

function clearTyping(state: State, key: ConvKey, name: string): State {
  const forKey = state.typing[key]
  if (!forKey?.[name]) return state
  const { [name]: _, ...rest } = forKey
  return { ...state, typing: { ...state.typing, [key]: rest } }
}

const sortUsers = (users: string[]) => [...new Set(users)].sort((a, b) => a.localeCompare(b))

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connecting':
      return { ...state, status: 'connecting', joinError: '' }

    case 'joined': {
      const { res } = action
      const next: State = {
        ...state,
        status: 'online',
        me: res.name,
        admin: res.admin,
        joinedVia: res.server,
        channels: res.channels,
        users: sortUsers(res.users ?? []),
        joinError: '',
        kickedBy: '',
      }
      const key = channelKey(res.channels[0] ?? 'general')
      return append({ ...next, active: state.me ? state.active : key }, key, {
        kind: 'system',
        text: `Joined as ${res.name} via ${res.server}${res.admin ? ' (admin)' : ''}`,
        ts: Date.now(),
      })
    }

    case 'joinFailed':
      return { ...state, status: 'idle', joinError: action.error }

    case 'message': {
      const { msg } = action
      const key = channelKey(msg.channel)
      const cleared = clearTyping(state, key, msg.name)
      return append(cleared, key, { kind: 'message', from: msg.name, content: msg.content, server: msg.server, ts: msg.ts })
    }

    case 'dm': {
      const { msg } = action
      const peer = msg.from === state.me ? msg.to : msg.from
      const key = dmKey(peer)
      const dms = state.dms.includes(peer) ? state.dms : [...state.dms, peer]
      return append({ ...state, dms }, key, { kind: 'message', from: msg.from, content: msg.content, server: msg.server, ts: msg.ts })
    }

    case 'system':
      return append(state, action.key, { kind: 'system', text: action.text, ts: Date.now() })

    case 'userJoined': {
      if (state.users.includes(action.name)) return state
      const next = { ...state, users: sortUsers([...state.users, action.name]) }
      return action.name === state.me ? next : append(next, '#general', { kind: 'system', text: `${action.name} joined`, ts: Date.now() })
    }

    case 'userLeft': {
      const next = { ...state, users: state.users.filter((u) => u !== action.name) }
      const withNotice = append(next, '#general', { kind: 'system', text: `${action.name} left`, ts: Date.now() })
      return state.dms.includes(action.name)
        ? append(withNotice, dmKey(action.name), { kind: 'system', text: `${action.name} went offline`, ts: Date.now() })
        : withNotice
    }

    case 'typing': {
      if (action.name === state.me) return state
      const forKey = { ...(state.typing[action.key] ?? {}), [action.name]: Date.now() + TYPING_MS }
      return { ...state, typing: { ...state.typing, [action.key]: forKey } }
    }

    case 'stats': {
      const { stats } = action
      const now = Date.now()
      const prev = state.servers[stats.id]
      const rate = prev ? Math.max(0, stats.messages - prev.messages) / Math.max(0.5, (now - prev.lastSeen) / 1000) : 0
      const info: ServerInfo = {
        id: stats.id,
        name: stats.name,
        messages: stats.messages,
        uptime: stats.uptime,
        rate,
        history: [...(prev?.history ?? []), rate].slice(-HISTORY),
        lastSeen: now,
      }
      return { ...state, servers: { ...state.servers, [stats.id]: info } }
    }

    case 'select': {
      const { [action.key]: _, ...unread } = state.unread
      const [kind, name] = [action.key[0], action.key.slice(1)]
      const dms = kind === '@' && !state.dms.includes(name) ? [...state.dms, name] : state.dms
      return { ...state, active: action.key, unread, dms }
    }

    case 'disconnected':
      if (state.status === 'kicked' || state.status === 'idle') return state
      if (!state.me) return { ...state, status: 'idle', joinError: `Cannot reach the server at port 3250` }
      return append({ ...state, status: 'offline' }, state.active, { kind: 'system', text: 'Connection lost', ts: Date.now() })

    case 'kicked':
      return { ...state, status: 'kicked', kickedBy: action.by || state.kickedBy }

    case 'tick': {
      const typing: State['typing'] = {}
      for (const [key, names] of Object.entries(state.typing)) {
        const alive = Object.fromEntries(Object.entries(names).filter(([, until]) => until > action.now))
        if (Object.keys(alive).length) typing[key] = alive
      }
      const servers = Object.fromEntries(
        Object.entries(state.servers).filter(([, s]) => action.now - s.lastSeen < SERVER_FORGET_MS),
      )
      return { ...state, typing, servers, now: action.now }
    }

    case 'reset':
      return { ...initialState, now: Date.now() }
  }
}
