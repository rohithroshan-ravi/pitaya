import { FormEvent, KeyboardEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Message, Role, roleRank } from '../pitaya'
import { ConvKey, HistoryState, Item, Status } from '../store'
import { colorFor, formatTime } from '../util'
import { Icon } from './Icon'

const QUICK_REACTIONS = ['👍', '😂', '🔥', '🎉', '❤️', '😮']

export function ChatPanel(props: {
  me: string
  myRole?: Role
  convKey: ConvKey | null
  title: string
  items: Item[]
  history?: HistoryState
  query: string
  typers: string[]
  status: Status
  canSend: boolean
  sendHint: string
  memberNames: string[]
  onSend: (content: string) => void
  onTyping: () => void
  onLoadOlder: () => void
  onReact: (m: Message, emoji: string) => void
  onDelete: (m: Message) => void
}) {
  const { me, myRole, convKey, title, items, history, query, typers, status, canSend, sendHint, memberNames } = props
  const q = query.trim().toLowerCase()
  const shown = q
    ? items.filter((i) => i.kind === 'message' && (i.content.toLowerCase().includes(q) || i.author.toLowerCase().includes(q)))
    : items
  const isChannel = !!convKey && !convKey.startsWith('@')

  return (
    <section className="chat">
      {q && (
        <div className="search-note">
          {shown.length} result{shown.length === 1 ? '' : 's'} for “{query.trim()}”
        </div>
      )}
      <MessageList
        key={convKey ?? 'none'}
        items={shown}
        me={me}
        canModerate={roleRank(myRole) >= roleRank('admin')}
        allowReactions={isChannel}
        header={
          isChannel && !q ? (
            history === 'more' || history === 'loading' ? (
              <button className="load-older" onClick={props.onLoadOlder} disabled={history === 'loading'}>
                {history === 'loading' ? 'Loading…' : 'Load older messages'}
              </button>
            ) : history === 'done' ? (
              <div className="channel-start">
                <span className="channel-start-icon">
                  <Icon name="hash" size={30} />
                </span>
                <h3>Welcome to {title}!</h3>
                <p>This is the start of the channel.</p>
              </div>
            ) : null
          ) : null
        }
        onReact={props.onReact}
        onDelete={props.onDelete}
      />
      <div className="typing">{typers.length > 0 && <TypingLine names={typers} />}</div>
      {convKey && (
        <Composer
          enabled={status === 'online' && canSend}
          placeholder={status !== 'online' ? 'Waiting for connection…' : canSend ? `Message ${title}` : sendHint}
          resetKey={convKey}
          memberNames={isChannel ? memberNames.filter((n) => n !== me) : []}
          onSend={props.onSend}
          onTyping={props.onTyping}
        />
      )}
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

function renderContent(content: string, mentions: string[], me: string) {
  if (!mentions.length) return content
  return content.split(/(@[^\s@]{1,24})/g).map((part, i) => {
    const name = part.slice(1)
    if (part.startsWith('@') && mentions.includes(name)) {
      return (
        <span key={i} className={`mention${name === me ? ' me' : ''}`}>
          {part}
        </span>
      )
    }
    return part
  })
}

function MessageList(props: {
  items: Item[]
  me: string
  canModerate: boolean
  allowReactions: boolean
  header: ReactNode
  onReact: (m: Message, emoji: string) => void
  onDelete: (m: Message) => void
}) {
  const { items, me, canModerate, allowReactions, header, onReact, onDelete } = props
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevFirst = useRef<string | undefined>(undefined)
  const prevHeight = useRef(0)

  const onScroll = () => {
    const el = ref.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // Follow new messages at the bottom; keep the view still when older
  // messages are prepended.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const first = items[0]?.id
    if (prevFirst.current && first !== prevFirst.current && !stick.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight
    }
    prevFirst.current = first
    prevHeight.current = el.scrollHeight
  }, [items])

  return (
    <div className="messages" ref={ref} onScroll={onScroll}>
      {header}
      {items.length === 0 && !header && (
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
        const grouped = prev?.kind === 'message' && prev.author === item.author && item.ts - prev.ts < 120_000
        const mine = item.author === me
        const mentionsMe = !mine && !!item.mentions?.includes(me)
        const reactions = Object.entries(item.reactions ?? {})
        const canDelete = allowReactions && (mine || canModerate)
        return (
          <div
            key={item.id}
            className={`row${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}${mentionsMe ? ' mentioned' : ''}`}
          >
            <div className="avatar" style={{ background: grouped ? 'transparent' : colorFor(item.author) }}>
              {!grouped && item.author.charAt(0).toUpperCase()}
            </div>
            <div className="body">
              {!grouped && (
                <div className="meta">
                  <span className="name" style={mine ? undefined : { color: colorFor(item.author) }}>
                    {mine ? 'You' : item.author}
                  </span>
                  <span className="time">{formatTime(item.ts)}</span>
                </div>
              )}
              <div className="bubble-wrap">
                <div className="bubble">{renderContent(item.content, item.mentions ?? [], me)}</div>
                {allowReactions && (
                  <div className="msg-tools">
                    {QUICK_REACTIONS.map((e) => (
                      <button key={e} onClick={() => onReact(item, e)} title={`React ${e}`} aria-label={`React ${e}`}>
                        {e}
                      </button>
                    ))}
                    {canDelete && (
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm('Delete this message?')) onDelete(item)
                        }}
                        title="Delete message"
                        aria-label="Delete message"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {reactions.length > 0 && (
                <div className="reactions">
                  {reactions.map(([emoji, users]) => (
                    <button
                      key={emoji}
                      className={`reaction${users.includes(me) ? ' mine' : ''}`}
                      onClick={() => onReact(item, emoji)}
                      title={users.join(', ')}
                    >
                      {emoji} <span>{users.length}</span>
                    </button>
                  ))}
                </div>
              )}
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
  memberNames: string[]
  onSend: (content: string) => void
  onTyping: () => void
}) {
  const { enabled, placeholder, resetKey, memberNames, onSend, onTyping } = props
  const [value, setValue] = useState('')
  const [pick, setPick] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue('')
    if (enabled) input.current?.focus()
  }, [enabled, resetKey])

  // "@na" at the end of the input suggests members whose name starts with "na".
  const token = /(?:^|\s)@([^\s@]*)$/.exec(value)?.[1]
  const suggestions =
    token === undefined ? [] : memberNames.filter((n) => n.toLowerCase().startsWith(token.toLowerCase())).slice(0, 6)

  const complete = (name: string) => {
    setValue(value.replace(/@([^\s@]*)$/, `@${name} `))
    setPick(0)
    input.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      complete(suggestions[Math.min(pick, suggestions.length - 1)])
    }
  }

  // Messages come back through the onMessage broadcast, so nothing is
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
      {suggestions.length > 0 && (
        <div className="suggest">
          <span className="suggest-head">Members matching @{token}</span>
          {suggestions.map((n, i) => (
            <button
              type="button"
              key={n}
              className={i === Math.min(pick, suggestions.length - 1) ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                complete(n)
              }}
            >
              <span className="avatar xs" style={{ background: colorFor(n) }}>
                {n.charAt(0).toUpperCase()}
              </span>
              {n}
            </button>
          ))}
        </div>
      )}
      <input
        ref={input}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={2000}
        disabled={!enabled}
        value={value}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setValue(e.target.value)
          setPick(0)
          if (e.target.value) onTyping()
        }}
      />
      <button type="submit" className="send" disabled={!enabled || !value.trim()} aria-label="Send">
        <Icon name="send" size={18} />
      </button>
    </form>
  )
}
