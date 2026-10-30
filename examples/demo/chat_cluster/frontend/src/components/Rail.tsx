import { ConvKey, channelKey } from '../store'
import { channelIcon, Icon } from './Icon'

export function Rail(props: {
  channels: string[]
  active: ConvKey
  unread: Record<ConvKey, number>
  onSelect: (key: ConvKey) => void
  onLeave: () => void
}) {
  const { channels, active, unread, onSelect, onLeave } = props
  return (
    <nav className="rail">
      <div className="rail-logo" title="Pitaya Chat">
        P
      </div>
      <div className="rail-items">
        {channels.map((c) => {
          const key = channelKey(c)
          return (
            <button
              key={c}
              className={`rail-btn${active === key ? ' active' : ''}`}
              onClick={() => onSelect(key)}
              title={`#${c}`}
              aria-label={`#${c}`}
            >
              <Icon name={channelIcon(c)} size={22} />
              {!!unread[key] && <span className="rail-dot" />}
            </button>
          )
        })}
      </div>
      <button className="rail-leave" onClick={onLeave} title="Leave chat" aria-label="Leave chat">
        <Icon name="logout" size={18} />
      </button>
    </nav>
  )
}
