import { useState } from 'react'
import { useTheme } from '../../store/theme'
import MonitoringGraph from './MonitoringGraph'

// ── Helpers ──────────────────────────────────────────────────
const fmtMs = ms => ms != null ? `${ms}ms` : '—'
const getDomain = u => { try { return new URL(u).hostname } catch { return u } }

// ── Status colors ─────────────────────────────────────────────
const BADGE = {
  ONLINE:   { bg: 'rgba(22,163,74,0.12)', color: '#16a34a', glow: 'none' },
  CRITICAL: { bg: 'rgba(217,119,6,0.12)', color: '#d97706', glow: 'none' },
  OFFLINE:  { bg: 'rgba(220,38,38,0.12)',  color: '#dc2626', glow: 'none' },
  UNKNOWN:  { bg: 'rgba(71,85,105,0.12)',   color: '#475569', glow: 'none' },
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
        display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
        cursor: 'pointer', transition: 'all 0.2s',
        border: isSelected ? `2.5px solid ${c.color}` : '1px solid var(--border)',
        background: isSelected ? `var(--accent-light)` : 'var(--bg-main)',
        marginBottom: 10, borderRadius: 10,
        boxShadow: isSelected ? `0 0 20px ${c.color}33` : 'var(--shadow)'
      }}
      onClick={() => {
        onSelect?.(w.id === isSelected ? null : w.id)
        onOpenDetail?.(w)
      }}
    >
      <div style={{ transform: 'scale(1.2)', marginRight: 4 }}>
        <Favicon url={w.url} name={w.name} />
      </div>
      
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {/* Status Dot */}
            <span style={{ 
              width: 10, height: 10, borderRadius: '50%', background: c.color, 
              boxShadow: `0 0 10px ${c.color}`, flexShrink: 0,
              animation: w.status === 'CRITICAL' || w.status === 'OFFLINE' ? 'pulse 1s infinite' : 'none' 
            }} />
            <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={w.name}>
              {w.name}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: isOnline ? 'var(--online)' : c.color, fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 4 }}>
              {w.status_code ? `HTTP ${w.status_code}` : 'TIMEOUT'}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>
             {w.root_cause && w.status !== 'ONLINE' ? `⚠️ ${w.root_cause.toUpperCase()}` : w.url}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: w.response_time_ms > 2000 ? 'var(--critical)' : 'var(--text-sub)', fontFamily: 'monospace' }}>
              {fmtMs(w.response_time_ms)}
            </span>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#fff', background: c.color, padding: '2px 8px', borderRadius: 5 }}>
              {w.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main StatusPanel ──────────────────────────────────────────

export default function StatusPanel({ websites, selectedId, onSelect, onOpenDetail, realtimeSnapshot }) {
  const sorted = [...websites].sort((a, b) => {
    const order = { OFFLINE: 0, CRITICAL: 1, ONLINE: 2, UNKNOWN: 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', backdropFilter:'blur(10px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: 1 }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, background: 'var(--online)', borderRadius: '50%', marginRight: 10, animation: 'pulse 2s infinite', boxShadow: '0 0 10px var(--online)' }}></span>
          MONITORING STATUS
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: 12 }}>
          {websites.length} WEBSITES
        </span>
      </div>

      {/* Content Stack: Live Feed Top, Graph Bottom */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* LIVE FEED SECTION (Top 60%) */}
        <div style={{ height: '60%', display: 'flex', flexDirection: 'column', borderBottom: '2px solid var(--border)' }}>
          <div style={{ padding: '8px 16px', background: 'var(--bg-main)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>
            🌐 ACTIVE MONITORING FEED
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column' }}>
            {sorted.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>// NO SERVICES CONFIGURED</div>
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
        </div>

        {/* GRAPH SECTION (Bottom 40%) */}
        <div style={{ height: '40%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
           <div style={{ padding: '8px 16px', background: 'var(--bg-main)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>
            📈 GLOBAL RESPONSE TIMES
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '10px' }}>
            <MonitoringGraph realtimeSnapshot={realtimeSnapshot} />
          </div>
        </div>

      </div>
    </div>
  )
}
