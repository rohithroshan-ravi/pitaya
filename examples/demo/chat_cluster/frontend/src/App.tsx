import { useMemo, useState } from 'react'
import { ChannelHero } from './components/ChannelHero'
import { ChannelSidebar } from './components/ChannelSidebar'
import { ChatPanel } from './components/ChatPanel'
import { GuildRail } from './components/GuildRail'
import { JoinScreen } from './components/JoinScreen'
import { MembersPanel } from './components/MembersPanel'
import { ChannelModal, GuildModal, InviteModal } from './components/Modals'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { dmKey, isDM } from './store'
import { useChat } from './useChat'

type Modal = 'guild' | 'invite' | 'channel' | null

export default function App() {
  const chat = useChat()
  const { state } = chat
  const [drawer, setDrawer] = useState<'none' | 'menu' | 'members'>('none')
  const [modal, setModal] = useState<Modal>(null)
  const [query, setQuery] = useState('')

  const { view, keyGuild, unread, mentions } = state
  const guildList = state.guildOrder.map((id) => state.guilds[id]).filter(Boolean)
  const guild = view.guildId ? state.guilds[view.guildId] ?? null : null
  const channels = view.guildId ? state.channels[view.guildId] : undefined
  const channel = channels?.find((c) => c.id === view.key) ?? null
  const peer = isDM(view.key) ? view.key!.slice(1) : null
  const members = view.guildId ? state.members[view.guildId] : undefined
  const onlineMembers = (members ?? []).filter((m) => state.online.includes(m.name)).map((m) => m.name)
  console.log('onlineMembers', onlineMembers)
  const { guildUnread, guildMentions, dmUnread, unreadTotal } = useMemo(() => {
    const guildUnread: Record<string, number> = {}
    const guildMentions: Record<string, number> = {}
    let dmUnread = 0
    let unreadTotal = 0
    for (const [key, n] of Object.entries(unread)) {
      unreadTotal += n
      if (isDM(key)) dmUnread += n
      else if (keyGuild[key]) guildUnread[keyGuild[key]] = (guildUnread[keyGuild[key]] ?? 0) + n
    }
    for (const [key, n] of Object.entries(mentions)) {
      if (!isDM(key) && keyGuild[key]) guildMentions[keyGuild[key]] = (guildMentions[keyGuild[key]] ?? 0) + n
    }
    return { guildUnread, guildMentions, dmUnread, unreadTotal }
  }, [unread, mentions, keyGuild])

  const servers = useMemo(() => Object.values(state.servers).sort((a, b) => a.name.localeCompare(b.name)), [state.servers])
  const typers = view.key ? Object.keys(state.typing[view.key] ?? {}) : []
  const guildTypers = [
    ...new Set(
      Object.entries(state.typing)
        .filter(([key]) => keyGuild[key] === view.guildId)
        .flatMap(([, names]) => Object.keys(names)),
    ),
  ]

  const closeDrawer = () => setDrawer('none')
  const selectKey = (key: string) => {
    chat.selectKey(key)
    setQuery('')
    closeDrawer()
  }
  const selectGuild = (id: string | null) => {
    chat.selectGuild(id)
    setQuery('')
  }

  // The bell jumps to the conversation with the most mentions, else unread.
  const jumpToUnread = () => {
    const pick = (rec: Record<string, number>) => Object.entries(rec).sort((a, b) => b[1] - a[1])[0]?.[0]
    const key = pick(mentions) ?? pick(unread)
    if (key) selectKey(key)
  }

  if (!state.me) {
    return <JoinScreen connecting={state.status === 'connecting'} error={state.joinError} onJoin={chat.join} />
  }

  const title = peer ? `@${peer}` : channel ? `#${channel.name}` : ''

  return (
    <div className="page">
      <div className={`frame drawer-${drawer}`}>
        <div className="nav">
          <GuildRail
            guilds={guildList}
            activeGuild={view.guildId}
            unread={guildUnread}
            mentions={guildMentions}
            dmUnread={dmUnread}
            onSelect={selectGuild}
            onAdd={() => setModal('guild')}
          />
          <ChannelSidebar
            me={state.me}
            joinedVia={state.joinedVia}
            guild={guild}
            channels={channels}
            dms={state.dms}
            online={state.online}
            active={view.key}
            unread={unread}
            mentions={mentions}
            onSelect={selectKey}
            onInvite={() => setModal('invite')}
            onCreateChannel={() => setModal('channel')}
            onDeleteChannel={(c) => {
              if (confirm(`Delete #${c.name}? Its messages are deleted too.`)) chat.deleteChannel(c)
            }}
            onLeaveGuild={() => {
              if (guild && confirm(`Leave ${guild.name}?`)) chat.leaveGuild(guild.id)
            }}
            onDeleteGuild={() => {
              if (guild && confirm(`Delete ${guild.name} for everyone? This cannot be undone.`)) chat.deleteGuild(guild.id)
            }}
            onLogout={chat.leave}
          />
        </div>

        <TopBar
          me={state.me}
          status={state.status}
          query={query}
          unread={unreadTotal}
          onQuery={setQuery}
          onBell={jumpToUnread}
          onReconnect={chat.reconnect}
          onToggleMenu={() => setDrawer((d) => (d === 'menu' ? 'none' : 'menu'))}
          onToggleMembers={() => setDrawer((d) => (d === 'members' ? 'none' : 'members'))}
        />

        <main className="main">
          <ChannelHero
            guild={guild}
            channel={channel}
            peer={peer}
            peerOnline={!!peer && state.online.includes(peer)}
            onlineMembers={onlineMembers}
            memberCount={members?.length ?? 0}
            joinedVia={state.joinedVia}
          />
          <ChatPanel
            me={state.me}
            myRole={guild?.role}
            convKey={view.key}
            title={title}
            items={view.key ? state.items[view.key] ?? [] : []}
            history={view.key ? state.history[view.key] : undefined}
            query={query}
            typers={typers}
            status={state.status}
            canSend={!peer || state.online.includes(peer)}
            sendHint={peer ? `${peer} is offline` : ''}
            memberNames={(members ?? []).map((m) => m.name)}
            onSend={chat.send}
            onTyping={chat.typing}
            onLoadOlder={chat.loadOlder}
            onReact={chat.react}
            onDelete={chat.deleteMessage}
          />
        </main>

        <MembersPanel
          me={state.me}
          guild={guild}
          members={members}
          online={state.online}
          typing={guildTypers}
          servers={servers}
          now={state.now}
          onDM={(name) => selectKey(dmKey(name))}
          onSetRole={(name, role) => guild && chat.setRole(guild.id, name, role)}
          onKick={(name) => guild && chat.kick(guild.id, name)}
        />

        {drawer !== 'none' && <div className="scrim" onClick={closeDrawer} />}
      </div>

      {modal === 'guild' && <GuildModal onClose={() => setModal(null)} onCreate={chat.createGuild} onJoin={chat.joinGuild} />}
      {modal === 'invite' && guild && <InviteModal guild={guild} onClose={() => setModal(null)} />}
      {modal === 'channel' && guild && (
        <ChannelModal guild={guild} onClose={() => setModal(null)} onCreate={(name, topic) => chat.createChannel(guild.id, name, topic)} />
      )}
      <Toasts toasts={state.toasts} onDismiss={chat.dismissToast} />
    </div>
  )
}
