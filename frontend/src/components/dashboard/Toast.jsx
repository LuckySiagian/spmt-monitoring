import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ── Global toast trigger function ──
// Call this from anywhere: showToast('Message', 'success')
// Types: 'success', 'error', 'info', 'warning'
export function showToast(message, type = 'success', duration = 3500) {
  window.dispatchEvent(new CustomEvent('spmt:toast', { detail: { message, type, duration } }))
}

const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

const COLORS = {
  success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.4)', text: '#059669', bar: '#10b981' },
  error: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.4)', text: '#dc2626', bar: '#ef4444' },
  warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)', text: '#d97706', bar: '#f59e0b' },
  info: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)', text: '#2563eb', bar: '#3b82f6' },
}

function ToastItem({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false)
  const c = COLORS[toast.type] || COLORS.info

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), toast.duration - 400)
    const removeTimer = setTimeout(() => onRemove(toast.id), toast.duration)
    return () => { clearTimeout(timer); clearTimeout(removeTimer) }
  }, [toast, onRemove])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', minWidth: 300, maxWidth: 480,
        background: c.bg, backdropFilter: 'blur(20px)',
        border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.bar}`,
        borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
        animation: exiting ? 'toastOut 0.35s ease forwards' : 'toastIn 0.35s ease forwards',
        overflow: 'hidden', position: 'relative', cursor: 'pointer',
      }}
      onClick={() => { setExiting(true); setTimeout(() => onRemove(toast.id), 350) }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{ICONS[toast.type]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
          {toast.message}
        </div>
      </div>
      <button style={{
        background: 'none', border: 'none', color: 'var(--text-muted)',
        cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: '0 2px',
      }}>✕</button>

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, height: 3,
        background: c.bar, borderRadius: '0 0 0 12px',
        animation: `toastProgress ${toast.duration}ms linear forwards`,
      }} />
    </div>
  )
}

let toastIdCounter = 0

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((e) => {
    const { message, type, duration } = e.detail
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, message, type, duration }].slice(-5))
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    window.addEventListener('spmt:toast', addToast)
    return () => window.removeEventListener('spmt:toast', addToast)
  }, [addToast])

  if (toasts.length === 0) return null

  return createPortal(
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 999999,
      display: 'flex', flexDirection: 'column', gap: 10,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  )
}
