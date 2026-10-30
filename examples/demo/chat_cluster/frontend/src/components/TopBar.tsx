import { Status } from '../store'
import { Icon } from './Icon'

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  online: 'Online',
  offline: 'Disconnected',
  kicked: 'Kicked',
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function TopBar(props: {
  me: string
  status: Status
  query: string
  unread: number
  onQuery: (q: string) => void
  onBell: () => void
  onReconnect: () => void
  onToggleMenu: () => void
  onToggleSide: () => void
}) {
  const { me, status, query, unread, onQuery, onBell, onReconnect } = props
  return (
    <header className="topbar">
      <button className="round only-mobile" onClick={props.onToggleMenu} aria-label="Channels">
        <Icon name="menu" />
      </button>
      <h2 className="greeting">
        <span>{greeting()},</span> {me}
      </h2>
      <span className={`conn ${status}`} title={STATUS_LABEL[status]}>
        <i />
        <span className="conn-label">{STATUS_LABEL[status]}</span>
      </span>
      {status === 'offline' && (
        <button className="round" onClick={onReconnect} title="Reconnect" aria-label="Reconnect">
          <Icon name="refresh" />
        </button>
      )}
      <label className="search">
        <Icon name="search" size={18} />
        <input placeholder="Search messages" value={query} onChange={(e) => onQuery(e.target.value)} />
        {query && (
          <button className="clear" onClick={() => onQuery('')} aria-label="Clear search">
            <Icon name="close" size={14} />
          </button>
        )}
      </label>
      <button className="round" onClick={onBell} title={unread ? `${unread} unread` : 'No unread messages'} aria-label="Unread">
        <Icon name="bell" />
        {unread > 0 && <span className="round-dot" />}
      </button>
      <button className="round only-narrow" onClick={props.onToggleSide} title="People and cluster" aria-label="People and cluster">
        <Icon name="stats" />
      </button>
    </header>
  )
}
