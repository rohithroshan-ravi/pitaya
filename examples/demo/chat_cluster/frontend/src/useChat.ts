import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  Channel,
  ChannelEvent,
  DirectMessage,
  GuildDetails,
  GuildRemoved,
  GuildResponse,
  HistoryResponse,
  JoinResponse,
  MemberEvent,
  Message,
  MessageDeleted,
  PITAYA_HOST,
  PITAYA_PORT,
  Presence,
  Response,
  Role,
  routes,
  ServerStats,
  starx,
  Typing,
} from './pitaya'
import { ConvKey, initialState, isDM, reducer } from './store'

const TYPING_THROTTLE_MS = 2000

export const errorText = (r: Response) => r.result || r.msg || `error ${r.code}`

function call<T extends Response>(route: string, msg: unknown): Promise<T> {
  return new Promise((resolve) => starx().request(route, msg, resolve))
}

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const creds = useRef({ name: '', adminKey: '' })
  const lastTyping = useRef(0)
  const loadingGuilds = useRef(new Set<string>())

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1000)
    return () => clearInterval(t)
  }, [])

  // Requests that fail are shown as a toast; returns the error text or null.
  const run = useCallback(async (route: string, msg: unknown) => {
    const res = await call<Response>(route, msg)
    if (res.code === 0) return null
    const text = errorText(res)
    dispatch({ type: 'toast', text, tone: 'error' })
    return text
  }, [])

  const openGuild = useCallback(async (guildId: string) => {
    if (loadingGuilds.current.has(guildId)) return
    loadingGuilds.current.add(guildId)
    try {
      const res = await call<GuildDetails>(routes.openGuild, { guildId })
      if (res.code === 0) dispatch({ type: 'guildLoaded', guild: res.guild, channels: res.channels, members: res.members })
      else dispatch({ type: 'toast', text: errorText(res), tone: 'error' })
    } finally {
      loadingGuilds.current.delete(guildId)
    }
  }, [])

  const loadHistory = useCallback(async (key: ConvKey) => {
    const s = stateRef.current
    const guildId = s.keyGuild[key]
    if (!guildId || s.history[key] === 'loading') return
    const first = s.items[key]?.find((i) => i.kind === 'message')
    const before = s.history[key] ? first?.id ?? '' : ''
    dispatch({ type: 'historyLoading', key })
    const res = await call<HistoryResponse>(routes.history, { guildId, channelId: key, before })
    if (res.code === 0) dispatch({ type: 'history', key, messages: res.messages ?? [], more: res.more })
    else dispatch({ type: 'toast', text: errorText(res), tone: 'error' })
  }, [])

  // Load a guild's channels when it is opened, and a channel's history when
  // it is first shown.
  const { status, view, channels, history } = state
  useEffect(() => {
    if (status === 'online' && view.guildId && !channels[view.guildId]) openGuild(view.guildId)
  }, [status, view.guildId, channels, openGuild])

  useEffect(() => {
    if (status === 'online' && view.key && !isDM(view.key) && !history[view.key]) loadHistory(view.key)
  }, [status, view.key, history, loadHistory])

  const connect = useCallback(() => {
    const client = starx()
    client.removeAllListeners()
    dispatch({ type: 'connecting' })

    client.on('onMessage', (msg: Message) => dispatch({ type: 'message', msg }))
    client.on('onMessageDeleted', (e: MessageDeleted) => dispatch({ type: 'messageDeleted', channelId: e.channelId, id: e.id }))
    client.on('onReaction', (msg: Message) => dispatch({ type: 'reaction', msg }))
    client.on('onDM', (msg: DirectMessage) => dispatch({ type: 'dm', msg }))
    client.on('onTyping', (t: Typing) => dispatch({ type: 'typing', key: t.channelId, name: t.name }))
    client.on('onPresence', (p: Presence) => dispatch({ type: 'presence', name: p.name, online: p.online }))
    client.on('onMemberJoined', (e: MemberEvent) => dispatch({ type: 'memberJoined', guildId: e.guildId, member: e.member }))
    client.on('onMemberLeft', (e: MemberEvent) => dispatch({ type: 'memberLeft', guildId: e.guildId, name: e.member.name }))
    client.on('onMemberUpdated', (e: MemberEvent) => dispatch({ type: 'memberUpdated', guildId: e.guildId, member: e.member }))
    client.on('onChannelCreated', (e: ChannelEvent) => dispatch({ type: 'channelCreated', channel: e.channel }))
    client.on('onChannelDeleted', (e: ChannelEvent) => dispatch({ type: 'channelDeleted', channel: e.channel }))
    client.on('onGuildRemoved', (e: GuildRemoved) => dispatch({ type: 'guildRemoved', guildId: e.guildId, reason: e.reason }))
    client.on('onServerStats', (stats: ServerStats) => dispatch({ type: 'stats', stats }))
    client.on('disconnect', () => dispatch({ type: 'disconnected' }))
    client.on('io-error', () => dispatch({ type: 'disconnected' }))

    client.init({ host: PITAYA_HOST, port: PITAYA_PORT, path: '/' }, () => {
      client.request(routes.join, creds.current, (res: JoinResponse) => {
        if (res.code === 0) {
          dispatch({ type: 'joined', res })
        } else {
          client.removeAllListeners()
          client.disconnect()
          dispatch({ type: 'joinFailed', error: errorText(res) })
        }
      })
    })
  }, [])

  const join = useCallback(
    (name: string, adminKey: string) => {
      creds.current = { name, adminKey }
      connect()
    },
    [connect],
  )

  const leave = useCallback(() => {
    const client = starx()
    client.removeAllListeners()
    client.disconnect()
    dispatch({ type: 'reset' })
  }, [])

  const send = useCallback(
    (content: string) => {
      const key = stateRef.current.view.key
      if (!key) return
      lastTyping.current = 0
      if (isDM(key)) {
        const to = key.slice(1)
        call<Response>(routes.dm, { to, content }).then((res) => {
          if (res.code !== 0) dispatch({ type: 'system', key, text: `Not delivered: ${errorText(res)}` })
        })
        return
      }
      run(routes.message, { guildId: stateRef.current.keyGuild[key], channelId: key, content })
    },
    [run],
  )

  const typing = useCallback(() => {
    const { view, keyGuild } = stateRef.current
    if (!view.key || isDM(view.key)) return
    const now = Date.now()
    if (now - lastTyping.current < TYPING_THROTTLE_MS) return
    lastTyping.current = now
    starx().notify(routes.typing, { guildId: keyGuild[view.key], channelId: view.key })
  }, [])

  const createGuild = useCallback(async (name: string, icon: string) => {
    const res = await call<GuildResponse>(routes.createGuild, { name, icon })
    if (res.code !== 0 || !res.guild) return errorText(res)
    dispatch({ type: 'guildAdded', guild: res.guild })
    dispatch({ type: 'selectGuild', guildId: res.guild.id })
    return null
  }, [])

  const joinGuild = useCallback(async (invite: string) => {
    const res = await call<GuildResponse>(routes.joinGuild, { invite })
    if (res.code !== 0 || !res.guild) return errorText(res)
    dispatch({ type: 'guildAdded', guild: res.guild })
    dispatch({ type: 'selectGuild', guildId: res.guild.id })
    return null
  }, [])

  const leaveGuild = useCallback(
    async (guildId: string) => {
      const name = stateRef.current.guilds[guildId]?.name
      if ((await run(routes.leaveGuild, { guildId })) === null) dispatch({ type: 'guildRemoved', guildId, reason: `You left ${name}` })
    },
    [run],
  )

  const dismissToast = useCallback((id: number) => dispatch({ type: 'dismissToast', id }), [])

  const createChannel = useCallback(async (guildId: string, name: string, topic: string) => {
    const res = await call<Response>(routes.createChannel, { guildId, name, topic })
    return res.code === 0 ? null : errorText(res)
  }, [])

  return {
    state,
    join,
    leave,
    reconnect: connect,
    send,
    typing,
    loadOlder: () => stateRef.current.view.key && loadHistory(stateRef.current.view.key),
    selectGuild: (guildId: string | null) => dispatch({ type: 'selectGuild', guildId }),
    selectKey: (key: ConvKey) => dispatch({ type: 'selectKey', key }),
    react: (m: Message, emoji: string) => run(routes.react, { guildId: m.guildId, channelId: m.channelId, id: m.id, emoji }),
    deleteMessage: (m: Message) => run(routes.deleteMessage, { guildId: m.guildId, channelId: m.channelId, id: m.id }),
    createGuild,
    joinGuild,
    leaveGuild,
    deleteGuild: (guildId: string) => run(routes.deleteGuild, { guildId }),
    createChannel,
    deleteChannel: (c: Channel) => run(routes.deleteChannel, { guildId: c.guildId, channelId: c.id }),
    setRole: (guildId: string, name: string, role: Role) => run(routes.setRole, { guildId, name, role }),
    kick: (guildId: string, name: string) => run(routes.kickMember, { guildId, name }),
    dismissToast,
  }
}
