import { Channel, Guild } from '../pitaya'
import { colorFor } from '../util'
import { Icon } from './Icon'

export function ChannelHero(props: {
  guild: Guild | null
  channel: Channel | null
  peer: string | null
  peerOnline: boolean
  onlineMembers: string[]
  memberCount: number
  joinedVia: string
}) {
  const { guild, channel, peer, peerOnline, onlineMembers, memberCount, joinedVia } = props
  const shown = peer ? [peer] : onlineMembers.slice(0, 4)

  return (
    <section className="hero">
      <div className="hero-content">
        <div className="chips">
          <span className="chip pale">
            <span className={`live${peer && !peerOnline ? ' off' : ''}`} />
            {peer ? (peerOnline ? 'Online' : 'Offline') : 'Live'}
          </span>
          {guild && (
            <span className="chip dark text" title={guild.name}>
              {guild.icon} {guild.name}
            </span>
          )}
          <span className="chip dark text">via {joinedVia}</span>
        </div>
        <h1>
          {peer ? (
            peer
          ) : channel ? (
            <>
              <Icon name="hash" size={30} />
              {channel.name}
            </>
          ) : (
            'Direct messages'
          )}
        </h1>
        <p>
          {peer
            ? `Private conversation, pushed only to you and ${peer} with SendPushToUsers.`
            : channel
              ? channel.topic || 'No topic yet.'
              : 'Pick someone from the Online list to start a private conversation.'}
        </p>
        <div className="hero-foot">
          <div className="stack">
            {shown.map((u) => (
              <span key={u} className="avatar sm" style={{ background: colorFor(u) }} title={u}>
                {u.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          {!peer && guild && (
            <span className="chip light">
              <Icon name="users" size={16} />
              {onlineMembers.length} online · {memberCount} members
            </span>
          )}
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orb" />
        <span className="glyph">{guild?.icon && guild.id !== 'hq' ? guild.icon : '🐉'}</span>
      </div>
    </section>
  )
}
