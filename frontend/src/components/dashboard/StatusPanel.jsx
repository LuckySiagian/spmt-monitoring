import { useState } from 'react'
import { useTheme } from '../../store/theme'
import MonitoringGraph from './MonitoringGraph'

// ── Helpers ──────────────────────────────────────────────────
const fmtMs = ms => ms != null ? `${ms}ms` : '—'
const getDomain = u => { try { return new URL(u).hostname } catch { return u } }

// ── Status colors ─────────────────────────────────────────────
const BADGE = {
  ONLINE:   { color: 'var(--online)', glow: 'rgba(0,184,148,0.1)' },
  CRITICAL: { color: 'var(--critical)', glow: 'rgba(255,165,2,0.1)' },
  OFFLINE:  { color: 'var(--offline)', glow: 'rgba(255,71,87,0.1)' },
  UNKNOWN:  { color: 'var(--text-muted)', glow: 'none' },
}

// ── Sub-components ────────────────────────────────────────────

function Favicon({ url, name }) {
  const domain = getDomain(url)
  const initial = (name || 'W')[0].toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        width={22} height={22} alt=""
        style={{ display: 'block' }}
        onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex' }}
      />
      <span style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
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
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
        cursor: 'pointer', transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease',
        border: '1px solid',
        borderColor: isSelected ? c.color : 'var(--border)',
        background: isSelected ? 'rgba(0,0,0,0.02)' : 'var(--bg-card)',
        marginBottom: 12, borderRadius: 0,
        boxShadow: isSelected ? `0 0 10px ${c.color}15 inset` : 'var(--shadow)',
        clipPath: 'polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px))',
        position: 'relative'
      }}
      onClick={() => {
        onSelect?.(w.id === isSelected ? null : w.id)
        onOpenDetail?.(w)
      }}
    >
      {/* Dynamic Status Vertical Line */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: c.color, boxShadow: `0 0 8px ${c.color}` }} />

      <div style={{ transform: 'scale(1.2)', marginRight: 6, marginLeft: 6 }}>
        <Favicon url={w.url} name={w.name} />
      </div>
      
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: '"Orbitron", sans-serif', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '1px' }} title={w.name}>
              {w.name}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isOnline ? 'var(--online)' : c.color, fontFamily: '"Orbitron", monospace', background: 'rgba(0,0,0,0.03)', border: `1px solid ${c.color}33`, padding: '2px 8px', borderRadius: 4 }}>
              {w.status_code ? `HTTP ${w.status_code}` : 'TIMEOUT'}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>
             {w.root_cause && w.status !== 'ONLINE' ? `⚠️ ${w.root_cause.toUpperCase()}` : w.url}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: w.response_time_ms > 2000 ? 'var(--critical)' : 'var(--text-sub)', fontFamily: '"Orbitron", monospace' }}>
              {fmtMs(w.response_time_ms)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.03)', padding: '2px 8px', borderRadius: 4, border: `1px solid ${c.color}15` }}>
               <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, boxShadow: `0 0 5px ${c.color}`, animation: 'pulse 1.5s infinite' }} />
               <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: c.color }}>
                 {w.status}
               </span>
            </div>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>
          <span style={{ width: 14, height: 14, background: 'var(--online)', borderRadius: '50%', marginRight: 12, animation: 'pulse 2.2s infinite', boxShadow: '0 0 12px var(--online)' }}></span>
          MONITORING STATUS
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--border)', padding: '5px 16px', borderRadius: 14 }}>
          {websites.length} WEBSITES
        </span>
      </div>

      {/* Content Stack: Live Feed Top, Graph Bottom */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* LIVE FEED SECTION (Top 60%) */}
        <div style={{ height: '60%', display: 'flex', flexDirection: 'column', borderBottom: '2px solid var(--border)' }}>
          <div style={{ padding: '10px 20px', background: 'var(--bg-header)', fontSize: 12, fontWeight: 800, fontFamily: '"Orbitron", sans-serif', color: 'var(--accent)', letterSpacing: '2px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 16, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
            ACTIVE MONITORING FEED
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
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
           <div style={{ padding: '10px 20px', background: 'var(--bg-header)', fontSize: 12, fontWeight: 800, fontFamily: '"Orbitron", sans-serif', color: 'var(--accent)', letterSpacing: '2px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 16, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
            GLOBAL RESPONSE TIMES
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '10px' }}>
            <MonitoringGraph realtimeSnapshot={realtimeSnapshot} />
          </div>
        </div>

      </div>
    </div>
  )
}
