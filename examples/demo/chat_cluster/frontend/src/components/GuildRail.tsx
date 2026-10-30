import { Guild } from '../pitaya'
import { Icon } from './Icon'

export function GuildRail(props: {
  guilds: Guild[]
  activeGuild: string | null
  unread: Record<string, number>
  mentions: Record<string, number>
  dmUnread: number
  onSelect: (guildId: string | null) => void
  onAdd: () => void
}) {
  const { guilds, activeGuild, unread, mentions, dmUnread, onSelect, onAdd } = props
  return (
    <nav className="rail">
      <button
        className={`guild-btn home${activeGuild === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
        title="Direct messages"
        aria-label="Direct messages"
      >
        <span className="guild-icon">P</span>
        {dmUnread > 0 && <span className="guild-badge">{dmUnread > 99 ? '99+' : dmUnread}</span>}
      </button>
      <div className="rail-sep" />
      <div className="rail-guilds">
        {guilds.map((g) => (
          <button
            key={g.id}
            className={`guild-btn${activeGuild === g.id ? ' active' : ''}${unread[g.id] ? ' unread' : ''}`}
            onClick={() => onSelect(g.id)}
            title={g.name}
            aria-label={g.name}
          >
            <span className="guild-pill" />
            <span className="guild-icon">{g.icon}</span>
            {!!mentions[g.id] && <span className="guild-badge">{mentions[g.id]}</span>}
          </button>
        ))}
        <button className="guild-add" onClick={onAdd} title="Create or join a server" aria-label="Create or join a server">
          <Icon name="plus" size={22} />
        </button>
      </div>
    </nav>
  )
}
