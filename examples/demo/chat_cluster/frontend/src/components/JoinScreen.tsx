import { FormEvent, useState } from 'react'
import { PITAYA_HOST, PITAYA_PORT } from '../pitaya'
import { loadPref, savePref } from '../util'

export function JoinScreen(props: { connecting: boolean; error: string; onJoin: (name: string, adminKey: string) => void }) {
  const { connecting, error, onJoin } = props
  const [name, setName] = useState(() => loadPref('pitaya-nickname'))
  const [adminKey, setAdminKey] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    savePref('pitaya-nickname', trimmed)
    onJoin(trimmed, adminKey)
  }

  return (
    <div className="overlay">
      <div className="card">
        <div className="logo">🐉</div>
        <h2>Pitaya Chat</h2>
        <p>Pick a nickname to join the cluster</p>
        <form onSubmit={submit}>
          <input autoFocus maxLength={24} placeholder="Your nickname" value={name} onChange={(e) => setName(e.target.value)} />
          {showAdmin ? (
            <input type="password" placeholder="Admin key (optional)" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          ) : (
            <button type="button" className="link" onClick={() => setShowAdmin(true)}>
              Join as admin?
            </button>
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={!name.trim() || connecting}>
            {connecting ? 'Connecting…' : 'Join'}
          </button>
        </form>
        <small>
          ws://{PITAYA_HOST}:{PITAYA_PORT}
        </small>
      </div>
    </div>
  )
}

export function KickedScreen({ by, onRejoin }: { by: string; onRejoin: () => void }) {
  return (
    <div className="overlay">
      <div className="card">
        <div className="logo danger">🚫</div>
        <h2>You were kicked</h2>
        <p>{by ? `${by} removed you from the chat.` : 'An admin removed you from the chat.'}</p>
        <button onClick={onRejoin} className="wide">
          Back to start
        </button>
      </div>
    </div>
  )
}
