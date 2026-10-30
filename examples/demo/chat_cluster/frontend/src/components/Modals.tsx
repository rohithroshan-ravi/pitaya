import { FormEvent, ReactNode, useState } from 'react'
import { Guild } from '../pitaya'
import { Icon } from './Icon'

const ICONS = ['🎮', '🍕', '🚀', '🎵', '📚', '⚽', '🐱', '🌈', '💜', '🔥']

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

export function GuildModal(props: {
  onClose: () => void
  onCreate: (name: string, icon: string) => Promise<string | null>
  onJoin: (invite: string) => Promise<string | null>
}) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICONS[0])
  const [invite, setInvite] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const err = tab === 'create' ? await props.onCreate(name.trim(), icon) : await props.onJoin(invite.trim())
    setBusy(false)
    if (err) setError(err)
    else props.onClose()
  }

  return (
    <Modal title="Add a server" onClose={props.onClose}>
      <h2>{tab === 'create' ? 'Create your server' : 'Join a server'}</h2>
      <p>{tab === 'create' ? 'Your server is where you and your friends hang out.' : 'Enter an invite code to join an existing server.'}</p>
      <div className="tabs">
        <button className={tab === 'create' ? 'on' : ''} onClick={() => (setTab('create'), setError(''))}>
          Create
        </button>
        <button className={tab === 'join' ? 'on' : ''} onClick={() => (setTab('join'), setError(''))}>
          Join
        </button>
      </div>
      <form onSubmit={submit}>
        {tab === 'create' ? (
          <>
            <div className="icon-pick">
              {ICONS.map((i) => (
                <button type="button" key={i} className={i === icon ? 'on' : ''} onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>
                  {i}
                </button>
              ))}
            </div>
            <label>
              Server name
              <input autoFocus maxLength={40} placeholder="e.g. Friday Night Raiders" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </>
        ) : (
          <label>
            Invite code
            <input autoFocus placeholder="e.g. pitaya" value={invite} onChange={(e) => setInvite(e.target.value)} />
          </label>
        )}
        {error && <div className="error">{error}</div>}
        <button type="submit" className="primary" disabled={busy || (tab === 'create' ? name.trim().length < 2 : !invite.trim())}>
          {busy ? 'Working…' : tab === 'create' ? 'Create server' : 'Join server'}
        </button>
      </form>
    </Modal>
  )
}

export function InviteModal({ guild, onClose }: { guild: Guild; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(guild.invite)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal title="Invite friends" onClose={onClose}>
      <h2>Invite friends to {guild.name}</h2>
      <p>Share this code. Friends paste it in “Join a server”.</p>
      <div className="invite-box">
        <code>{guild.invite}</code>
        <button className="primary" onClick={copy}>
          <Icon name="copy" size={16} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </Modal>
  )
}

export function ChannelModal(props: { guild: Guild; onClose: () => void; onCreate: (name: string, topic: string) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const slug = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const err = await props.onCreate(slug, topic.trim())
    setBusy(false)
    if (err) setError(err)
    else props.onClose()
  }

  return (
    <Modal title="Create channel" onClose={props.onClose}>
      <h2>Create channel</h2>
      <p>in {props.guild.name}</p>
      <form onSubmit={submit}>
        <label>
          Channel name
          <span className="input-prefix">
            <Icon name="hash" size={16} />
            <input autoFocus maxLength={32} placeholder="new-channel" value={name} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>
        <label>
          Topic <em>(optional)</em>
          <input maxLength={120} placeholder="What is this channel about?" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" className="primary" disabled={busy || !slug}>
          {busy ? 'Creating…' : 'Create channel'}
        </button>
      </form>
    </Modal>
  )
}
