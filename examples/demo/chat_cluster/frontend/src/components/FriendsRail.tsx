import { useEffect, useState } from 'react'
import { colorFor } from '../util'
import { Icon } from './Icon'

interface Popover {
  name: string
  top: number
  right: number
}

export function FriendsRail(props: {
  me: string
  admin: boolean
  users: string[]
  typing: string[]
  onDM: (name: string) => void
  onKick: (name: string) => void
}) {
  const { me, admin, users, typing, onDM, onKick } = props
  const [open, setOpen] = useState<Popover | null>(null)
  const others = users.filter((u) => u !== me)

  useEffect(() => {
    if (open && !users.includes(open.name)) setOpen(null)
  }, [open, users])

  const toggle = (name: string, el: HTMLElement) => {
    if (open?.name === name) return setOpen(null)
    const rect = el.getBoundingClientRect()
    setOpen({ name, top: rect.top, right: window.innerWidth - rect.left + 12 })
  }

  return (
    <aside className="friends">
      <div className="me-avatar" style={{ background: colorFor(me) }} title={`${me}${admin ? ' (admin)' : ''}`}>
        {me.charAt(0).toUpperCase()}
        {admin && <span className="tag">Admin</span>}
      </div>
      <span className="friends-icon" title={`${others.length} other(s) online`}>
        <Icon name="users" size={22} />
        <small>{others.length}</small>
      </span>
      <div className="friends-list" onScroll={() => setOpen(null)}>
        {others.length === 0 && <p className="hint">Nobody else yet</p>}
        {others.map((u) => (
          <button
            key={u}
            className={`friend-avatar${open?.name === u ? ' open' : ''}`}
            style={{ background: colorFor(u) }}
            onClick={(e) => toggle(u, e.currentTarget)}
            title={u}
            aria-label={u}
          >
            {u.charAt(0).toUpperCase()}
            <span className="presence on" />
            {typing.includes(u) && <span className="tag">Typing</span>}
          </button>
        ))}
      </div>

      {open && (
        <>
          <div className="popover-scrim" onClick={() => setOpen(null)} />
          <div className="popover" style={{ top: open.top, right: open.right }}>
            <strong>{open.name}</strong>
            <button
              onClick={() => {
                setOpen(null)
                onDM(open.name)
              }}
            >
              <Icon name="send" size={14} /> Message
            </button>
            {admin && (
              <button
                className="danger"
                onClick={() => {
                  setOpen(null)
                  onKick(open.name)
                }}
              >
                <Icon name="close" size={14} /> Kick
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
