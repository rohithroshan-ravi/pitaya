import { useState } from 'react'
import { Guild, Member, Role, roleRank } from '../pitaya'
import { ServerInfo } from '../store'
import { colorFor } from '../util'
import { Icon, IconName } from './Icon'

const STALE_MS = 5000

const ROLE_ICON: Partial<Record<Role, IconName>> = { owner: 'crown', admin: 'shield' }

interface Popover {
  name: string
  top: number
  right: number
}

export function MembersPanel(props: {
  me: string
  guild: Guild | null
  members: Member[] | undefined
  online: string[]
  typing: string[]
  servers: ServerInfo[]
  now: number
  onDM: (name: string) => void
  onSetRole: (name: string, role: Role) => void
  onKick: (name: string) => void
}) {
  const { me, guild, members, online, typing, servers, now } = props
  const [open, setOpen] = useState<Popover | null>(null)
  const isOnline = (n: string) => online.includes(n)

  // Guild view lists members by role, then offline; home lists everyone online.
  const list: Member[] = guild
    ? (members ?? [])
    : online.map((name) => ({ name, role: 'member' as Role, joined: 0 }))
  const sorted = [...list].sort((a, b) => roleRank(b.role) - roleRank(a.role) || a.name.localeCompare(b.name))
  const sections: [string, Member[]][] = guild
    ? [
        ['Owner', sorted.filter((m) => m.role === 'owner' && isOnline(m.name))],
        ['Admins', sorted.filter((m) => m.role === 'admin' && isOnline(m.name))],
        ['Online', sorted.filter((m) => m.role === 'member' && isOnline(m.name))],
        ['Offline', sorted.filter((m) => !isOnline(m.name))],
      ]
    : [['Online', sorted]]

  const target = open && list.find((m) => m.name === open.name)
  const myRole = guild?.role
  const canKick = (m: Member) => !!guild && m.name !== me && roleRank(myRole) >= roleRank('admin') && roleRank(myRole) > roleRank(m.role)
  const canPromote = (m: Member) => !!guild && myRole === 'owner' && m.name !== me && m.role !== 'owner'

  const toggle = (name: string, el: HTMLElement) => {
    if (open?.name === name) return setOpen(null)
    const rect = el.getBoundingClientRect()
    setOpen({ name, top: Math.min(rect.top, window.innerHeight - 200), right: window.innerWidth - rect.left + 10 })
  }

  return (
    <aside className="members">
      <ClusterCard servers={servers} users={online.length} now={now} />

      <div className="member-list" onScroll={() => setOpen(null)}>
        {guild && !members && <p className="hint">Loading members…</p>}
        {sections.map(
          ([title, ms]) =>
            ms.length > 0 && (
              <section key={title}>
                <h4>
                  {title} — {ms.length}
                </h4>
                {ms.map((m) => {
                  const on = isOnline(m.name)
                  const roleIcon = ROLE_ICON[m.role]
                  return (
                    <button
                      key={m.name}
                      className={`member${on ? '' : ' off'}${open?.name === m.name ? ' open' : ''}`}
                      onClick={(e) => toggle(m.name, e.currentTarget)}
                    >
                      <span className="avatar sm" style={{ background: colorFor(m.name) }}>
                        {m.name.charAt(0).toUpperCase()}
                        <span className={`presence${on ? ' on' : ''}`} />
                      </span>
                      <span className="member-name">
                        {m.name}
                        {m.name === me && <em> (you)</em>}
                      </span>
                      {typing.includes(m.name) && <span className="tag">Typing</span>}
                      {roleIcon && (
                        <span className={`role-icon ${m.role}`} title={m.role}>
                          <Icon name={roleIcon} size={14} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </section>
            ),
        )}
      </div>

      {open && target && (
        <>
          <div className="popover-scrim" onClick={() => setOpen(null)} />
          <div className="popover" style={{ top: open.top, right: open.right }}>
            <div className="popover-head">
              <span className="avatar" style={{ background: colorFor(target.name) }}>
                {target.name.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{target.name}</strong>
                <em>
                  {guild ? target.role : ''}
                  {guild ? ' · ' : ''}
                  {isOnline(target.name) ? 'online' : 'offline'}
                </em>
              </span>
            </div>
            {target.name !== me && (
              <button
                disabled={!isOnline(target.name)}
                onClick={() => {
                  setOpen(null)
                  props.onDM(target.name)
                }}
              >
                <Icon name="send" size={14} /> Message
              </button>
            )}
            {canPromote(target) && (
              <button
                onClick={() => {
                  setOpen(null)
                  props.onSetRole(target.name, target.role === 'admin' ? 'member' : 'admin')
                }}
              >
                <Icon name="shield" size={14} /> {target.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </button>
            )}
            {canKick(target) && (
              <button
                className="danger"
                onClick={() => {
                  setOpen(null)
                  if (confirm(`Kick ${target.name} from ${guild!.name}?`)) props.onKick(target.name)
                }}
              >
                <Icon name="close" size={14} /> Kick from server
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  )
}

function ClusterCard({ servers, users, now }: { servers: ServerInfo[]; users: number; now: number }) {
  const alive = servers.filter((s) => now - s.lastSeen < STALE_MS)
  const handled = alive.reduce((sum, s) => sum + s.messages, 0)
  const rate = alive.reduce((sum, s) => sum + s.rate, 0)

  return (
    <section className="cluster">
      <div className="ring" style={{ ['--speed' as string]: `${Math.max(3, 14 - rate * 2)}s` }}>
        <div className="ring-blob" />
        <div className="ring-core">
          <span>Handled</span>
          <strong>{handled.toLocaleString()}</strong>
          <em>{rate.toFixed(1)} msg/s</em>
        </div>
      </div>
      <div className="cluster-side">
        <h3>Cluster</h3>
        <p>
          {alive.length} room server{alive.length === 1 ? '' : 's'} · {users} online
        </p>
        <div className="servers">
          {servers.length === 0 && <span className="hint">Waiting for stats…</span>}
          {servers.map((s) => {
            const stale = now - s.lastSeen >= STALE_MS
            return (
              <span
                key={s.id}
                className={`server-chip${stale ? ' stale' : ''}`}
                title={stale ? `${s.name} stopped reporting` : `${s.messages} handled · ${s.rate.toFixed(1)} msg/s`}
              >
                <i style={stale ? undefined : { background: colorFor(s.name) }} />
                {s.name}
                <b>{stale ? 'off' : s.messages}</b>
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}
