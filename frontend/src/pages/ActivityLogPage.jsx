import { useState, useEffect } from 'react'
import { eventsAPI } from '../services/api'

const SC = { ONLINE: '#059669', CRITICAL: '#d97706', OFFLINE: '#dc2626', SERVER_DOWN: '#991b1b', WEB_DOWN: '#ea580c', DNS_ERROR: '#7c3aed', SSL_INVALID: '#be185d', SLOW: '#ca8a04' }
const SB = { ONLINE: 'rgba(5,150,105,0.1)', CRITICAL: 'rgba(217,119,6,0.1)', OFFLINE: 'rgba(220,38,38,0.1)', SERVER_DOWN: 'rgba(153,27,27,0.1)', WEB_DOWN: 'rgba(234,88,12,0.1)', DNS_ERROR: 'rgba(124,58,237,0.1)', SSL_INVALID: 'rgba(190,24,93,0.1)', SLOW: 'rgba(202,138,4,0.1)' }
const Badge = ({ s }) => <span style={{ background: SB[s] || 'rgba(100,116,139,0.1)', color: SC[s] || '#64748b', border: `1px solid ${SC[s] || '#64748b'}33`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{s}</span>
const FILTERS = ['ALL', 'ONLINE', 'CRITICAL', 'OFFLINE']

export default function ActivityLogPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const PER = 50

  useEffect(() => { setLoading(true); eventsAPI.getAll(500).then(r => setEvents(r.data || [])).catch(() => setEvents([])).finally(() => setLoading(false)) }, [])
  const fmt = d => d ? new Date(d).toLocaleString('id-ID', { hour12: false }) : '—'
  const filtered = events.filter(ev => filter === 'ALL' || ev.new_status === filter)
  const total = Math.max(1, Math.ceil(filtered.length / PER))
  const paged = filtered.slice((page - 1) * PER, page * PER)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '8px 10px' }}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 2px 16px rgba(99,102,241,0.10)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(99,102,241,0.1)', background: 'rgba(255,255,255,0.92)', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>📋 Activity Log</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>Complete history · {events.length} events</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(1) }}
                style={{ background: filter === f ? 'rgba(79,70,229,0.12)' : 'rgba(99,102,241,0.05)', border: filter === f ? '1px solid rgba(79,70,229,0.4)' : '1px solid rgba(99,102,241,0.15)', color: filter === f ? '#4f46e5' : '#64748b', fontSize: 9, fontWeight: 700, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.06em' }}>{f}</button>
            ))}
          </div>
        </div>
        {/* Table */}
        {loading ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
          : paged.length === 0 ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No events found.</div> : (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{['Service', 'Transition', 'New Status', 'Time'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 9, color: 'var(--text-sub)', letterSpacing: '0.1em', borderBottom: '1px solid rgba(99,102,241,0.1)', fontWeight: 700, background: 'var(--bg-card)', position: 'sticky', top: 0 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {paged.map((ev, i) => (
                      <tr key={ev.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)', background: i % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.02)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.02)'}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>{ev.website_name}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ color: SC[ev.old_status] || '#64748b', fontSize: 11 }}>{ev.old_status || '—'}</span>
                          <span style={{ color: '#cbd5e1', margin: '0 8px' }}>→</span>
                          <span style={{ color: SC[ev.new_status] || '#64748b', fontWeight: 700, fontSize: 11 }}>{ev.new_status}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}><Badge s={ev.new_status} /></td>
                        <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 11 }}>{fmt(ev.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 1 && <div style={{ display: 'flex', gap: 5, justifyContent: 'center', padding: '10px', borderTop: '1px solid rgba(99,102,241,0.1)', background: 'rgba(241,245,249,0.8)' }}>
                <button style={pb(false)} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(7, total) }, (_, i) => { const p = Math.max(1, Math.min(total - 6, page - 3)) + i; return <button key={p} style={pb(p === page)} onClick={() => setPage(p)}>{p}</button> })}
                <button style={pb(false)} onClick={() => setPage(p => Math.min(total, p + 1))} disabled={page === total}>›</button>
              </div>}
            </>
          )}
      </div>
    </div>
  )
}
const pb = a => ({ background: a ? '#4f46e5' : 'rgba(99,102,241,0.08)', border: `1px solid ${a ? '#4f46e5' : 'rgba(99,102,241,0.15)'}`, color: a ? 'var(--text)' : '#64748b', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer' })
