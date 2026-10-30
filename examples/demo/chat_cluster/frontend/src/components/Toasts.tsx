import { useEffect } from 'react'
import { Toast } from '../store'
import { Icon } from './Icon'

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])
  return (
    <div className={`toast ${toast.tone}`}>
      <span>{toast.text}</span>
      <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
