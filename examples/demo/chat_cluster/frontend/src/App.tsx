import { useMemo, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { FriendsRail } from './components/FriendsRail'
import { Hero } from './components/Hero'
import { JoinScreen, KickedScreen } from './components/JoinScreen'
import { Rail } from './components/Rail'
import { SidePanel } from './components/SidePanel'
import { TopBar } from './components/TopBar'
import { dmKey } from './store'
import { useChat } from './useChat'

export default function App() {
  const { state, join, leave, reconnect, send, typing, kick, select } = useChat()
  const [drawer, setDrawer] = useState<'none' | 'menu' | 'side'>('none')
  const [query, setQuery] = useState('')

  const servers = useMemo(
    () => Object.values(state.servers).sort((a, b) => a.name.localeCompare(b.name)),
    [state.servers],
  )
  const typers = Object.keys(state.typing[state.active] ?? {})
  const allTypers = [...new Set(Object.values(state.typing).flatMap((t) => Object.keys(t)))]
  const peerOnline = state.users.includes(state.active.slice(1))
  const unreadTotal = Object.values(state.unread).reduce((a, b) => a + b, 0)

  const choose = (key: string) => {
    select(key)
    setQuery('')
    setDrawer('none')
  }

  const jumpToUnread = () => {
    const [key] = Object.entries(state.unread).sort((a, b) => b[1] - a[1])[0] ?? []
    if (key) choose(key)
  }

  if (state.status === 'kicked') return <KickedScreen by={state.kickedBy} onRejoin={leave} />

  if (!state.me) {
    return <JoinScreen connecting={state.status === 'connecting'} error={state.joinError} onJoin={join} />
  }

  return (
    <div className="page">
      <div className={`frame drawer-${drawer}`}>
        <Rail channels={state.channels} active={state.active} unread={state.unread} onSelect={choose} onLeave={leave} />

        <TopBar
          me={state.me}
          status={state.status}
          query={query}
          unread={unreadTotal}
          onQuery={setQuery}
          onBell={jumpToUnread}
          onReconnect={reconnect}
          onToggleMenu={() => setDrawer((d) => (d === 'menu' ? 'none' : 'menu'))}
          onToggleSide={() => setDrawer((d) => (d === 'side' ? 'none' : 'side'))}
        />

        <main className="main">
          <Hero active={state.active} users={state.users} joinedVia={state.joinedVia} peerOnline={peerOnline} />
          <ChatPanel
            me={state.me}
            active={state.active}
            items={state.convs[state.active] ?? []}
            query={query}
            typers={typers}
            status={state.status}
            peerOnline={peerOnline}
            onSend={send}
            onTyping={typing}
          />
        </main>

        <div className="right">
          <SidePanel
            dms={state.dms}
            convs={state.convs}
            unread={state.unread}
            users={state.users}
            active={state.active}
            servers={servers}
            now={state.now}
            onSelect={choose}
          />
          <FriendsRail
            me={state.me}
            admin={state.admin}
            users={state.users}
            typing={allTypers}
            onDM={(name) => choose(dmKey(name))}
            onKick={(name) => {
              if (confirm(`Kick ${name} from the chat?`)) kick(name)
            }}
          />
        </div>

        {drawer !== 'none' && <div className="scrim" onClick={() => setDrawer('none')} />}
      </div>
    </div>
  )
}
