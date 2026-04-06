import { useState } from 'react'
import { useTheme } from '../../store/theme'
import MonitoringGraph from './MonitoringGraph'

// ── Helpers ──────────────────────────────────────────────────
const fmtMs = ms => ms != null ? `${ms}ms` : '—'
const getDomain = u => { try { return new URL(u).hostname } catch { return u } }

// ── Status colors ─────────────────────────────────────────────
const BADGE = {
  ONLINE:   { bg: 'rgba(16,185,129,0.15)', color: '#10b981', glow: '0 0 10px rgba(16,185,129,0.3)' },
  CRITICAL: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', glow: '0 0 12px rgba(245,158,11,0.4)' },
  OFFLINE:  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', glow: '0 0 10px rgba(239,68,68,0.4)' },
  UNKNOWN:  { bg: 'rgba(156,163,175,0.10)', color: '#9ca3af', glow: 'none' },
}

// ── Sub-components ────────────────────────────────────────────

const Favicon = ({ url, name }) => {
  const domain = getDomain(url)
  const initial = (name || 'W')[0].toUpperCase()
  return (
    <div style={{ width: 22, height: 22, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        width={14} height={14} alt=""
        style={{ display: 'block' }}
        onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex' }}
      />
      <span style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
        {initial}
      </span>
    </div>
  )
}

// ── ServiceRow (Compact List Item) ────────────────────────────

function ServiceRow({ w, isSelected, onSelect, onOpenDetail }) {
  const c = BADGE[w.status] || BADGE.UNKNOWN
  const isOnline = w.status === 'ONLINE'
  
  return (
    <div
      className={`glass-card hover-glow ${w.status === 'OFFLINE' ? 'glitch-offline' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        cursor: 'pointer', transition: 'all 0.2s',
        border: isSelected ? `1px solid ${c.color}` : '1px solid var(--border)',
        background: isSelected ? `rgba(255,255,255,0.05)` : 'var(--bg-card)',
        boxShadow: isSelected ? c.glow : 'none',
        marginBottom: 6, borderRadius: 8
      }}
      onClick={() => {
        onSelect?.(w.id === isSelected ? null : w.id)
        onOpenDetail?.(w)
      }}
    >
      <Favicon url={w.url} name={w.name} />
      
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            {/* Status Dot */}
            <span style={{ 
              width: 6, height: 6, borderRadius: '50%', background: c.color, 
              boxShadow: c.glow, flexShrink: 0,
              animation: w.status === 'CRITICAL' ? 'pulse 1s infinite' : 'none' 
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={w.name}>
              {w.name}
            </span>
          </div>
          
          {/* Quick Metrics */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: isOnline ? 'var(--text-sub)' : c.color, fontFamily: 'monospace' }}>
              {w.status_code ? `HTTP ${w.status_code}` : 'TIMEOUT'}
            </span>
            <span style={{ fontSize: 10, color: w.response_time_ms > 2000 ? 'var(--critical)' : 'var(--text-sub)', fontFamily: 'monospace', width: 45, textAlign: 'right' }}>
              {fmtMs(w.response_time_ms)}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
             {w.root_cause && w.status !== 'ONLINE' ? `⚠ ${w.root_cause}` : w.url}
          </span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: c.color, background: c.bg, padding: '1px 6px', borderRadius: 4 }}>
            {w.status}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main StatusPanel ──────────────────────────────────────────

const TABS = [
  { id: 'services', label: '⚡ LIVE FEED' },
  { id: 'graph',    label: '📈 GRAPH HISTORY' },
]

export default function StatusPanel({ websites, selectedId, onSelect, onOpenDetail, realtimeSnapshot }) {
  const [tab, setTab] = useState('services')

  const sorted = [...websites].sort((a, b) => {
    const order = { OFFLINE: 0, CRITICAL: 1, ONLINE: 2, UNKNOWN: 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', backdropFilter:'blur(10px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: 1 }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, background: 'var(--online)', borderRadius: '50%', marginRight: 8, animation: 'pulse 2s infinite', boxShadow: '0 0 10px var(--online)' }}></span>
          SYSTEM STATUS
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-sub)', background: 'var(--bg-main)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 10 }}>
          {websites.length} DOMAINS
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--accent-light)', flexShrink: 0 }}>
        {TABS.map(tb => (
          <button
            key={tb.id}
            style={{
              flex: 1, background: tab === tb.id ? 'rgba(99,102,241,0.1)' : 'transparent', border: 'none',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              padding: '10px 4px', cursor: 'pointer',
              color: tab === tb.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab === tb.id ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {tab === 'services' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column' }}>
            {sorted.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '40px 0' }}>// NO SERVICES CONFIGURED</div>
            )}
            {sorted.map(w => (
              <ServiceRow
                key={w.id}
                w={w}
                isSelected={selectedId === w.id}
                onSelect={onSelect}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </div>
        )}

        {tab === 'graph' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <MonitoringGraph realtimeSnapshot={realtimeSnapshot} />
          </div>
        )}

      </div>
    </div>
  )
}
