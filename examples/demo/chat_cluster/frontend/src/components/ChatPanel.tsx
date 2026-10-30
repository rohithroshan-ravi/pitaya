import { FormEvent, useEffect, useRef, useState } from 'react'
import { ConvKey, Item, Status } from '../store'
import { colorFor, formatTime } from '../util'
import { Icon } from './Icon'

export function ChatPanel(props: {
  me: string
  active: ConvKey
  items: Item[]
  query: string
  typers: string[]
  status: Status
  peerOnline: boolean
  onSend: (content: string) => void
  onTyping: () => void
}) {
  const { me, active, items, query, typers, status, peerOnline, onSend, onTyping } = props
  const isDM = active.startsWith('@')
  const q = query.trim().toLowerCase()
  const shown = q
    ? items.filter((i) => i.kind === 'message' && (i.content.toLowerCase().includes(q) || i.from.toLowerCase().includes(q)))
    : items

  return (
    <section className="chat">
      {q && (
        <div className="search-note">
          {shown.length} result{shown.length === 1 ? '' : 's'} for “{query.trim()}” in {active}
        </div>
      )}
      <MessageList items={shown} me={me} />
      <div className="typing">{typers.length > 0 && <TypingLine names={typers} />}</div>
      <Composer
        enabled={status === 'online' && (!isDM || peerOnline)}
        placeholder={
          status !== 'online'
            ? 'Waiting for connection…'
            : isDM && !peerOnline
              ? `${active.slice(1)} is offline`
              : `Message ${active}`
        }
        onSend={onSend}
        onTyping={onTyping}
        resetKey={active}
      />
    </section>
  )
}

function TypingLine({ names }: { names: string[] }) {
  const text =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names.length} people are typing`
  return (
    <>
      <span className="dots">
        <i />
        <i />
        <i />
      </span>
      {text}
    </>
  )
}

function MessageList({ items, me }: { items: Item[]; me: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Only follow new messages when the user is already at the bottom.
  const onScroll = () => {
    const el = ref.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    if (stick.current) ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [items])

  return (
    <div className="messages" ref={ref} onScroll={onScroll}>
      {items.length === 0 && (
        <div className="empty">
          <div className="big">💬</div>
          No messages yet. Say hi!
        </div>
      )}
      {items.map((item, i) => {
        if (item.kind === 'system') {
          return (
            <div key={item.id} className="system">
              {item.text}
            </div>
          )
        }
        const prev = items[i - 1]
        const grouped = prev?.kind === 'message' && prev.from === item.from && item.ts - prev.ts < 120_000
        const mine = item.from === me
        return (
          <div key={item.id} className={`row${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
            <div className="avatar" style={{ background: grouped ? 'transparent' : colorFor(item.from) }}>
              {!grouped && item.from.charAt(0).toUpperCase()}
            </div>
            <div className="body">
              {!grouped && (
                <div className="meta">
                  <span className="name" style={mine ? undefined : { color: colorFor(item.from) }}>
                    {mine ? 'You' : item.from}
                  </span>
                  <span className="time">{formatTime(item.ts)}</span>
                </div>
              )}
              <div className="bubble">{item.content}</div>
              <span className="via" title="Room server that handled this message">
                <i style={{ background: colorFor(item.server) }} />
                via {item.server}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Composer(props: {
  enabled: boolean
  placeholder: string
  resetKey: string
  onSend: (content: string) => void
  onTyping: () => void
}) {
  const { enabled, placeholder, resetKey, onSend, onTyping } = props
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue('')
    if (enabled) input.current?.focus()
  }, [enabled, resetKey])

  // Channel messages come back through the onMessage broadcast, so nothing is
  // rendered optimistically here.
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const content = value.trim()
    if (!content || !enabled) return
    onSend(content)
    setValue('')
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        ref={input}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={500}
        disabled={!enabled}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (e.target.value) onTyping()
        }}
      />
      <button type="submit" className="send" disabled={!enabled || !value.trim()} aria-label="Send">
        <Icon name="send" size={18} />
      </button>
    </form>
  )
}
