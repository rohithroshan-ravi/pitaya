import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  ChatMessage,
  DirectMessage,
  JoinResponse,
  Notice,
  PITAYA_HOST,
  PITAYA_PORT,
  Response,
  routes,
  ServerStats,
  starx,
  Typing,
  UserEvent,
} from './pitaya'
import { channelKey, dmKey, initialState, reducer } from './store'

const TYPING_THROTTLE_MS = 2000

const errorText = (r: Response) => r.result || r.msg || `error ${r.code}`

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const creds = useRef({ name: '', adminKey: '' })
  const lastTyping = useRef(0)

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1000)
    return () => clearInterval(t)
  }, [])

  const connect = useCallback(() => {
    const client = starx()
    client.removeAllListeners()
    dispatch({ type: 'connecting' })

    client.on('onMessage', (msg: ChatMessage) => dispatch({ type: 'message', msg }))
    client.on('onDM', (msg: DirectMessage) => dispatch({ type: 'dm', msg }))
    client.on('onTyping', (t: Typing) => dispatch({ type: 'typing', key: channelKey(t.channel), name: t.name }))
    client.on('onUserJoined', (e: UserEvent) => dispatch({ type: 'userJoined', name: e.name }))
    client.on('onUserLeft', (e: UserEvent) => dispatch({ type: 'userLeft', name: e.name }))
    client.on('onNotice', (n: Notice) => dispatch({ type: 'system', key: '#general', text: n.text }))
    client.on('onServerStats', (stats: ServerStats) => dispatch({ type: 'stats', stats }))
    client.on('onKicked', (n: Notice) => dispatch({ type: 'kicked', by: n.text }))
    client.on('onKick', () => dispatch({ type: 'kicked', by: '' }))
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
      const key = state.active
      const target = key.slice(1)
      if (key.startsWith('#')) {
        starx().notify(routes.message, { channel: target, content })
        lastTyping.current = 0
        return
      }
      starx().request(routes.dm, { to: target, content }, (res: Response) => {
        if (res.code !== 0) dispatch({ type: 'system', key: dmKey(target), text: `Not delivered: ${errorText(res)}` })
      })
    },
    [state.active],
  )

  const typing = useCallback(() => {
    if (!state.active.startsWith('#')) return
    const now = Date.now()
    if (now - lastTyping.current < TYPING_THROTTLE_MS) return
    lastTyping.current = now
    starx().notify(routes.typing, { channel: state.active.slice(1) })
  }, [state.active])

  const kick = useCallback((name: string) => {
    starx().request(routes.kick, { name }, (res: Response) => {
      if (res.code !== 0) dispatch({ type: 'system', key: '#general', text: `Kick failed: ${errorText(res)}` })
    })
  }, [])

  const select = useCallback((key: string) => dispatch({ type: 'select', key }), [])

  return { state, join, leave, reconnect: connect, send, typing, kick, select }
}
