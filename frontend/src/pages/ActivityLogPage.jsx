import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import Badge from '../components/common/Badge'
import { useTheme } from '../store/theme'

const SC = { ONLINE: '#10b981', WARNING: '#f59e0b', DEGRADED: '#f97316', CRITICAL: '#ef4444', OFFLINE: '#dc2626', SERVER_DOWN: '#dc2626', WEB_DOWN: '#f97316', DNS_ERROR: '#8b5cf6', SSL_INVALID: '#ec4899', SLOW: '#eab308' }
const LOCALE_MAP = { id: 'id-ID', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU' }
// SB removed in favor of common Badge
const FILTERS = ['ALL', 'ONLINE', 'CRITICAL', 'OFFLINE']

export default function ActivityLogPage({ events }) {
  const { t, tStatus, lang } = useTheme()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [filter, setFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const PER = 50

  const fmt = d => d ? new Date(d).toLocaleString(locale, { hour12: false }) : '—'
  const filtered = events.filter(ev => filter === 'ALL' || ev.new_status === filter)
  const total = Math.max(1, Math.ceil(filtered.length / PER))
  const paged = filtered.slice((page - 1) * PER, page * PER)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '8px 10px' }}>
      <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.02em' }}>📋 {t.activityLogTitle}</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>{t.completeHistory} · {events.length} {t.eventsLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(1) }}
                style={{ background: filter === f ? 'rgba(79,70,229,0.12)' : 'rgba(99,102,241,0.05)', border: filter === f ? '1px solid rgba(79,70,229,0.4)' : '1px solid rgba(99,102,241,0.15)', color: filter === f ? '#4f46e5' : 'var(--text-muted)', fontSize: 13, fontWeight: 800, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.06em' }}>{f === 'ALL' ? t.allStatus : tStatus(f)}</button>
            ))}
          </div>
        </div>
        {/* Table */}
        {!events || events.length === 0 ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t.noEventsFound}</div> : (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{[t.colService, t.colTransition, t.colNewStatus, t.colTime].map(h => <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 13, color: 'var(--text-sub)', letterSpacing: '0.1em', borderBottom: '1px solid rgba(99,102,241,0.1)', fontWeight: 800, background: 'var(--bg-card)', position: 'sticky', top: 0 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {paged.map((ev, i) => (
                      <tr key={ev.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)', background: i % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.02)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.02)'}>
                        <td style={{ padding: '16px 18px', fontWeight: 800, color: 'var(--text)', fontSize: 16 }}>{ev.website_name}</td>
                        <td style={{ padding: '16px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: SC[ev.old_status] || 'var(--text-muted)', fontSize: 14, opacity: 0.6, fontWeight: 600 }}>{ev.old_status ? tStatus(ev.old_status) : '—'}</span>
                            <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ color: SC[ev.new_status] || 'var(--text-muted)', fontWeight: 900, fontSize: 16 }}>{tStatus(ev.new_status)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 18px' }}><Badge status={ev.new_status} /></td>
                        <td style={{ padding: '16px 18px', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>{fmt(ev.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 1 && <div style={{ display: 'flex', gap: 5, justifyContent: 'center', padding: '10px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
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
