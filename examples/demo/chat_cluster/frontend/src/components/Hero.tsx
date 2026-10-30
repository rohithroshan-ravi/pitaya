import { ConvKey } from '../store'
import { colorFor } from '../util'
import { channelIcon, Icon } from './Icon'

const DESCRIPTIONS: Record<string, string> = {
  general: 'Talk about anything with everyone in the cluster. Each message is handled by a random room server and broadcast to the lobby group.',
  game: 'Find teammates, plan matches and share your best plays.',
  random: 'Memes, off-topic and everything else.',
}

export function Hero(props: { active: ConvKey; users: string[]; joinedVia: string; peerOnline: boolean }) {
  const { active, users, joinedVia, peerOnline } = props
  const isDM = active.startsWith('@')
  const name = active.slice(1)
  const shown = isDM ? [name] : users.slice(0, 3)

  return (
    <section className="hero">
      <div className="hero-content">
        <div className="chips">
          <span className="chip pale">
            <span className={`live${isDM && !peerOnline ? ' off' : ''}`} />
            {isDM ? (peerOnline ? 'Online' : 'Offline') : 'Live'}
          </span>
          <span className="chip dark" title={isDM ? 'Direct message' : `#${name}`}>
            <Icon name={isDM ? 'send' : channelIcon(name)} size={16} />
          </span>
          <span className="chip dark text">via {joinedVia}</span>
        </div>
        <h1>{isDM ? name : `#${name}`}</h1>
        <p>
          {isDM
            ? `Private conversation. Messages are pushed only to you and ${name} with SendPushToUsers.`
            : DESCRIPTIONS[name] ?? 'A channel on the Pitaya cluster.'}
        </p>
        <div className="hero-foot">
          <div className="stack">
            {shown.map((u) => (
              <span key={u} className="avatar sm" style={{ background: colorFor(u) }} title={u}>
                {u.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          {!isDM && (
            <span className="chip light">
              <Icon name="users" size={16} />
              {users.length} online
            </span>
          )}
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orb" />
        <span className="glyph">🐉</span>
      </div>
    </section>
  )
}
