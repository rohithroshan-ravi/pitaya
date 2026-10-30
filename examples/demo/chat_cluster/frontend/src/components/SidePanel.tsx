import { ConvKey, dmKey, Item, ServerInfo } from '../store'
import { colorFor } from '../util'
import { Icon } from './Icon'

const STALE_MS = 5000

export function SidePanel(props: {
  dms: string[]
  convs: Record<ConvKey, Item[]>
  unread: Record<ConvKey, number>
  users: string[]
  active: ConvKey
  servers: ServerInfo[]
  now: number
  onSelect: (key: ConvKey) => void
}) {
  const { dms, convs, unread, users, active, servers, now, onSelect } = props
  return (
    <div className="side">
      <div className="dm-list">
        {dms.length === 0 && (
          <div className="dm-card hint-card">
            <span className="dm-icon">
              <Icon name="send" size={20} />
            </span>
            <span>
              <strong>No direct messages yet</strong>
              <em>Tap someone in the friends bar to DM them</em>
            </span>
          </div>
        )}
        {dms.map((u) => {
          const key = dmKey(u)
          const last = [...(convs[key] ?? [])].reverse().find((i) => i.kind === 'message')
          return (
            <button key={u} className={`dm-card${active === key ? ' active' : ''}`} onClick={() => onSelect(key)}>
              <span className="dm-avatar" style={{ background: colorFor(u) }}>
                {u.charAt(0).toUpperCase()}
                <span className={`presence${users.includes(u) ? ' on' : ''}`} />
              </span>
              <span className="dm-text">
                <strong>{u}</strong>
                <em>{last?.kind === 'message' ? `${last.from === u ? '' : 'You: '}${last.content}` : 'Say hi 👋'}</em>
              </span>
              {unread[key] ? <span className="badge">{unread[key]}</span> : <Icon name="chevron" size={18} />}
            </button>
          )
        })}
      </div>

      <ClusterCard servers={servers} users={users.length} now={now} />
    </div>
  )
}

function ClusterCard({ servers, users, now }: { servers: ServerInfo[]; users: number; now: number }) {
  const alive = servers.filter((s) => now - s.lastSeen < STALE_MS)
  const handled = alive.reduce((sum, s) => sum + s.messages, 0)
  const rate = alive.reduce((sum, s) => sum + s.rate, 0)

  return (
    <section className="cluster">
      <div className="section-head">
        <h3>Cluster statistic</h3>
        <span className="muted">
          <Icon name="arrow" size={18} />
        </span>
      </div>
      <div className="cluster-body">
        <div className="ring" style={{ ['--speed' as string]: `${Math.max(3, 14 - rate * 2)}s` }}>
          <div className="ring-blob" />
          <div className="ring-core">
            <span>Messages handled</span>
            <strong>{handled.toLocaleString()}</strong>
            <em>
              {rate.toFixed(1)} msg/s · {users} online
            </em>
          </div>
        </div>
        {servers.length === 0 && <p className="hint">Waiting for room servers…</p>}
        <div className="servers">
          {servers.map((s) => {
            const stale = now - s.lastSeen >= STALE_MS
            return (
              <div key={s.id} className={`server${stale ? ' stale' : ''}`} title={stale ? `${s.name} stopped reporting` : s.id}>
                <span className="server-badge" style={stale ? undefined : { background: colorFor(s.name) }}>
                  <Icon name="stats" size={22} />
                </span>
                <strong>{stale ? 'offline' : s.messages.toLocaleString()}</strong>
                <span className="server-name">{s.name}</span>
                {!stale && <em>{s.rate.toFixed(1)}/s</em>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
