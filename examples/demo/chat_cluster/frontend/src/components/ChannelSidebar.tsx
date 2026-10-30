import { useState } from 'react'
import { Channel, Guild, roleRank } from '../pitaya'
import { ConvKey, dmKey } from '../store'
import { colorFor } from '../util'
import { Icon } from './Icon'

export function ChannelSidebar(props: {
  me: string
  joinedVia: string
  guild: Guild | null
  channels: Channel[] | undefined
  dms: string[]
  online: string[]
  active: ConvKey | null
  unread: Record<ConvKey, number>
  mentions: Record<ConvKey, number>
  onSelect: (key: ConvKey) => void
  onInvite: () => void
  onCreateChannel: () => void
  onDeleteChannel: (c: Channel) => void
  onLeaveGuild: () => void
  onDeleteGuild: () => void
  onLogout: () => void
}) {
  const { me, joinedVia, guild, channels, dms, online, active, unread, mentions, onSelect } = props
  const [menu, setMenu] = useState(false)
  const isAdmin = roleRank(guild?.role) >= roleRank('admin')

  const badge = (key: ConvKey) =>
    mentions[key] ? <span className="badge">{mentions[key]}</span> : unread[key] ? <span className="unread-dot" /> : null

  return (
    <aside className="sidebar">
      {guild ? (
        <div className="guild-head">
          <button className="guild-title" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <span className="guild-title-icon">{guild.icon}</span>
            <span className="guild-title-text">
              <strong>{guild.name}</strong>
              <em>{guild.role}</em>
            </span>
            <Icon name={menu ? 'close' : 'chevronDown'} size={18} />
          </button>
          {menu && (
            <div className="menu" onClick={() => setMenu(false)}>
              <button onClick={props.onInvite}>
                <Icon name="link" size={16} /> Invite people
              </button>
              {isAdmin && (
                <button onClick={props.onCreateChannel}>
                  <Icon name="plus" size={16} /> Create channel
                </button>
              )}
              {guild.role === 'owner' ? (
                guild.id !== 'hq' && (
                  <button className="danger" onClick={props.onDeleteGuild}>
                    <Icon name="trash" size={16} /> Delete server
                  </button>
                )
              ) : (
                guild.id !== 'hq' && (
                  <button className="danger" onClick={props.onLeaveGuild}>
                    <Icon name="logout" size={16} /> Leave server
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="guild-head">
          <div className="guild-title static">
            <span className="guild-title-icon">💬</span>
            <span className="guild-title-text">
              <strong>Direct messages</strong>
              <em>{online.length} online</em>
            </span>
          </div>
        </div>
      )}

      <div className="channel-list">
        {guild ? (
          <>
            <div className="list-head">
              <span>Text channels</span>
              {isAdmin && (
                <button className="icon-btn" onClick={props.onCreateChannel} title="Create channel" aria-label="Create channel">
                  <Icon name="plus" size={16} />
                </button>
              )}
            </div>
            {!channels && <p className="hint">Loading…</p>}
            {channels?.map((c) => (
              <div key={c.id} className={`channel${active === c.id ? ' active' : ''}${unread[c.id] ? ' unread' : ''}`}>
                <button className="channel-btn" onClick={() => onSelect(c.id)}>
                  <Icon name="hash" size={18} />
                  <span>{c.name}</span>
                  {badge(c.id)}
                </button>
                {isAdmin && channels.length > 1 && (
                  <button
                    className="icon-btn channel-del"
                    onClick={() => props.onDeleteChannel(c)}
                    title={`Delete #${c.name}`}
                    aria-label={`Delete #${c.name}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="list-head">
              <span>Conversations</span>
            </div>
            {dms.length === 0 && <p className="hint">Pick someone from Online to start a DM</p>}
            {dms.map((u) => (
              <button key={u} className={`channel dm${active === dmKey(u) ? ' active' : ''}`} onClick={() => onSelect(dmKey(u))}>
                <span className="avatar xs" style={{ background: colorFor(u) }}>
                  {u.charAt(0).toUpperCase()}
                  <span className={`presence${online.includes(u) ? ' on' : ''}`} />
                </span>
                <span>{u}</span>
                {badge(dmKey(u))}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="me-card">
        <span className="avatar sm" style={{ background: colorFor(me) }}>
          {me.charAt(0).toUpperCase()}
          <span className="presence on" />
        </span>
        <span className="me-text">
          <strong>{me}</strong>
          <em>via {joinedVia}</em>
        </span>
        <button className="icon-btn" onClick={props.onLogout} title="Log out" aria-label="Log out">
          <Icon name="logout" size={18} />
        </button>
      </div>
    </aside>
  )
}
