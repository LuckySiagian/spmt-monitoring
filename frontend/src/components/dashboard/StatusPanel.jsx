import { useState } from 'react'
import { useTheme } from '../../store/theme'
import MonitoringGraph from './MonitoringGraph'
import { Info, X, Zap } from 'lucide-react'

function InfoModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: 600, maxWidth: '100%', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)', animation: 'fadeIn 0.2s ease' }}>
        <div style={{ padding: '20px 24px', background: 'var(--primary)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Info size={18} /></div>
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.02em' }}>MONITORING GUIDE</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', opacity: 0.8 }}><X /></button>
        </div>

        <div style={{ padding: 30 }}>
          <div style={{ marginBottom: 25 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 15, textTransform: 'uppercase' }}>Status Legend & Conditions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { s: 'ONLINE', c: '#10b981', t: 'HTTP 200-399 + RT ≤ 3.000ms', d: 'Website sehat, responsif, dan seluruh parameter valid.' },
                { s: 'CRITICAL', c: '#f59e0b', t: 'Slow / Degraded / Issues', d: 'Website terdeteksi lambat, mengalami gangguan akses, atau masalah SSL/DNS.' },
                { s: 'OFFLINE', c: '#f43f5e', t: 'Down / Timeout / HTTP 5xx', d: 'Website tidak dapat diakses sama sekali atau mengalami kegagalan fatal.' }
              ].map(item => (
                <div key={item.s} style={{ display: 'flex', gap: 16, padding: 14, background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.c, marginTop: 4, flexShrink: 0, boxShadow: `0 0 10px ${item.c}44` }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: item.c }}>{item.s}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>{item.t}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5 }}>{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 20, background: 'rgba(99, 102, 241, 0.05)', borderRadius: 12, border: '1px dashed var(--accent)' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} /> ENGINE MONITORING
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Sistem kami melakukan pengecekan kesehatan secara berkala dengan 3 pilihan standar (<b>30s, 60s, atau 120s</b>). Data yang Anda lihat di dashboard ini bersifat <b>Real-Time (Fresh)</b> yang dikirimkan secara langsung melalui WebSocket.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────
const fmtMs = ms => ms != null ? `${ms}ms` : '—'
const getDomain = u => { try { return new URL(u).hostname } catch { return u } }

// ── Status colors ─────────────────────────────────────────────
const BADGE = {
  ONLINE: { color: '#10b981', glow: 'rgba(16,185,129,0.15)' },
  DEGRADED: { color: '#8b5cf6', glow: 'rgba(139,92,246,0.15)' },
  WARNING: { color: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
  CRITICAL: { color: '#d97706', glow: 'rgba(217,119,6,0.15)' },
  OFFLINE: { color: '#f43f5e', glow: 'rgba(244,63,94,0.15)' },
  UNKNOWN: { color: '#94a3b8', glow: 'none' },
}

// ── Sub-components ────────────────────────────────────────────

function Favicon({ url, name }) {
  const domain = getDomain(url)
  // Skip Google Favicon API for internal/private domains to avoid console 404s
  const shouldSkip = /^(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(domain) ||
    domain.endsWith('.pelindo.co.id') ||
    domain.endsWith('.pelindomultiterminal.co.id')

  const initial = (name || 'W')[0].toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {!shouldSkip ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          width={22} height={22} alt=""
          style={{ display: 'block' }}
          onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex' }}
        />
      ) : null}
      <span style={{ display: shouldSkip ? 'flex' : 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
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
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        cursor: 'pointer', transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease',
        border: '1px solid',
        borderColor: isSelected ? c.color : 'var(--border)',
        background: isSelected ? 'rgba(0,0,0,0.02)' : 'var(--bg-card)',
        marginBottom: 10, borderRadius: 0,
        boxShadow: isSelected ? `0 0 10px ${c.color}15 inset` : 'var(--shadow)',
        clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
        position: 'relative'
      }}
      onClick={() => {
        onSelect?.(w.id === isSelected ? null : w.id)
        onOpenDetail?.(w)
      }}
    >
      {/* Dynamic Status Vertical Line */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: c.color, boxShadow: `0 0 8px ${c.color}` }} />

      <div style={{ transform: 'scale(1.1)', flexShrink: 0 }}>
        <Favicon url={w.url} name={w.name} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span 
            style={{ 
              fontSize: '15px', fontWeight: 1000, fontFamily: '"Inter", sans-serif', color: 'var(--text)', 
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, lineHeight: 1.1 
            }} 
            title={w.name}
          >
            {w.name}
          </span>
          <span style={{ 
            fontSize: 14, 
            fontWeight: 900, 
            color: !w.status_code ? '#ef4444' : (isOnline ? '#10b981' : c.color), 
            fontFamily: '"Inter", sans-serif', 
            background: 'rgba(0,0,0,0.03)', 
            border: `1px solid ${!w.status_code ? '#ef444433' : c.color + '33'}`, 
            padding: '2px 8px', 
            borderRadius: 4,
            flexShrink: 0
          }}>
            {w.status_code ? `HTTP ${w.status_code}` : 'TIMEOUT'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${c.color}15`, padding: '2px 8px', borderRadius: 4, border: `1px solid ${c.color}33`, flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, boxShadow: `0 0 6px ${c.color}`, animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.05em', color: c.color }}>
              {w.status}
            </span>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 1000, color: w.response_time_ms > 15000 ? 'var(--status-critical)' : 'var(--text-sub)', fontFamily: '"Inter", sans-serif', flexShrink: 0 }}>
            {fmtMs(w.response_time_ms)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main StatusPanel ──────────────────────────────────────────

export default function StatusPanel({ websites, selectedId, onSelect, onOpenDetail, realtimeSnapshot }) {
  const [showInfo, setShowInfo] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = websites.filter(w => 
    w.name.toLowerCase().includes(search.toLowerCase()) || 
    w.url.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    const order = { OFFLINE: 0, CRITICAL: 1, WARNING: 2, DEGRADED: 3, ONLINE: 4, UNKNOWN: 5 }
    return (order[a.status] ?? 6) - (order[b.status] ?? 6)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', backdropFilter: 'blur(10px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: 1 }}>

      {/* Content Stack: Live Feed Top, Graph Bottom */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* LIVE FEED SECTION (Top 60%) */}
        <div style={{ height: '60%', display: 'flex', flexDirection: 'column', borderBottom: '2px solid var(--border)' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-header)', fontSize: 11, fontWeight: 900, fontFamily: '"Inter", sans-serif', color: 'var(--primary)', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ width: 4, height: 16, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
              NODES FEED
              <span style={{ marginLeft: 4, padding: '2px 8px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 10, fontSize: 10, border: '1px solid var(--border)' }}>
                {filtered.length} / {websites.length}
              </span>
            </div>

            {/* --- SEARCH BAR --- */}
            <div style={{ width: 140, margin: '0 8px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, opacity: 0.5 }}>🔍</span>
              <input 
                style={{ 
                  width: '100%', padding: '6px 30px 6px 28px', borderRadius: 15, 
                  border: '1px solid var(--border)', background: 'var(--bg-card)', 
                  color: 'var(--text)', fontSize: 11, outline: 'none', transition: 'all 0.2s'
                }} 
                placeholder="Search..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}>✕</button>
              )}
            </div>

            <button
              onClick={() => setShowInfo(true)}
              style={{ background: 'var(--accent-light)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', flexShrink: 0 }}
              title="Learn about status meanings"
            >
              <Info size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
            {sorted.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>
                {search ? `// NO MATCHING NODES FOUND FOR "${search.toUpperCase()}"` : '// NO SERVICES CONFIGURED'}
              </div>
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
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '10px' }}>
            <MonitoringGraph realtimeSnapshot={realtimeSnapshot} />
          </div>
        </div>

      </div>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}
