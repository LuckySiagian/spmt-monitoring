import { useState } from 'react'

const STATUS_FILTERS = ['ALL', 'ONLINE', 'CRITICAL', 'OFFLINE']

const StatusBadge = ({ status }) => {
  const c = {
    ONLINE: { color: '#10b981', border: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.1)' },
    CRITICAL: { color: '#f59e0b', border: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.1)' },
    OFFLINE: { color: '#ef4444', border: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.1)' },
  }[status] || { color: '#4a5568', border: 'rgba(74,85,104,0.3)', bg: 'rgba(74,85,104,0.1)' }
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 3, padding: '1px 7px', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
      {status || 'PENDING'}
    </span>
  )
}

const fmt = (ms) => ms != null ? `${ms}ms` : '—'
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('id-ID', { hour12: false }) : '—'

export default function MonitoringTable({ websites, onOpenDetail }) {
  const [filter, setFilter] = useState('ALL')

  const filtered = filter === 'ALL' ? websites : websites.filter(w => w.status === filter)

  const counts = {
    ALL: websites.length,
    ONLINE: websites.filter(w => w.status === 'ONLINE').length,
    CRITICAL: websites.filter(w => w.status === 'CRITICAL').length,
    OFFLINE: websites.filter(w => w.status === 'OFFLINE').length,
  }

  const filterColors = {
    ALL: '#4a6fa5',
    ONLINE: '#10b981',
    CRITICAL: '#f59e0b',
    OFFLINE: '#ef4444',
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ marginRight: 6 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          <span style={styles.headerTitle}>MONITORING TABLE</span>
          <span style={styles.countBadge}>{filtered.length} services</span>
        </div>

        <div style={styles.filters}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              style={{
                ...styles.filterBtn,
                ...(filter === f ? { background: `rgba(${f === 'ALL' ? '74,111,165' : f === 'ONLINE' ? '16,185,129' : f === 'CRITICAL' ? '245,158,11' : '239,68,68'},0.15)`, color: filterColors[f], borderColor: filterColors[f] + '66' } : {}),
              }}
              onClick={() => setFilter(f)}
            >
              {f} <span style={{ opacity: 0.7, marginLeft: 3 }}>{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Website', 'URL', 'Status', 'HTTP', 'Response', 'SSL', 'Last Check'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '16px', color: '#4a5568', fontSize: 11 }}>
                  No services match this filter
                </td>
              </tr>
            ) : filtered.map((w, i) => {
              const domain = (() => { try { return new URL(w.url).hostname } catch { return w.url } })()
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
              return (
                <tr
                  key={w.id}
                  style={{ ...styles.row, background: i % 2 === 0 ? 'transparent' : 'rgba(30,45,74,0.15)', cursor: onOpenDetail ? 'pointer' : 'default' }}
                  onClick={() => onOpenDetail?.(w)}
                >
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <img
                        src={faviconUrl} width={14} height={14}
                        style={{ borderRadius: 2, flexShrink: 0 }}
                        onError={e => e.target.style.display = 'none'}
                        alt=""
                      />
                      <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 11 }}>{w.name}</span>
                    </div>
                  </td>
                  <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <a href={w.url} target="_blank" rel="noreferrer" style={{ color: '#4a6fa5', textDecoration: 'none', fontSize: 10 }} onClick={e => e.stopPropagation()}>
                      {w.url}
                    </a>
                  </td>
                  <td style={styles.td}><StatusBadge status={w.status} /></td>
                  <td style={styles.td}>{w.status_code ?? '—'}</td>
                  <td style={{ ...styles.td, color: w.response_time_ms > 3000 ? '#ef4444' : w.response_time_ms > 1000 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                    {fmt(w.response_time_ms)}
                  </td>
                  <td style={{ ...styles.td, color: w.ssl_valid == null ? '#4a5568' : w.ssl_valid ? '#10b981' : '#ef4444' }}>
                    {w.ssl_valid == null ? '—' : w.ssl_valid ? '✓ Valid' : '✗ Invalid'}
                  </td>
                  <td style={{ ...styles.td, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(w.last_checked)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  container: {
    background: 'var(--bg-main)',
    border: '1px solid #1e2d4a',
    borderRadius: '8px',
    display: 'flex', flexDirection: 'column',
    flexShrink: 0,
    height: '195px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 14px',
    borderBottom: '1px solid #1e2d4a',
    background: 'var(--bg-main)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex', alignItems: 'center',
  },
  headerTitle: {
    fontSize: '10px', fontWeight: '600', color: '#4a6fa5', letterSpacing: '0.1em',
  },
  countBadge: {
    fontSize: '10px', color: '#1e3a5f', background: '#0a0e1a',
    padding: '2px 8px', borderRadius: '10px', marginLeft: 8,
  },
  filters: {
    display: 'flex', gap: '4px',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid #1e2d4a',
    color: '#4a5568',
    fontSize: '10px', fontWeight: '600', letterSpacing: '0.05em',
    padding: '3px 10px', borderRadius: '4px',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  tableWrap: {
    flex: 1, overflowY: 'auto', overflowX: 'hidden',
  },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: 11,
  },
  th: {
    position: 'sticky', top: 0,
    textAlign: 'left', padding: '5px 10px',
    fontSize: '9px', color: '#4a6fa5', letterSpacing: '0.1em',
    background: '#0a0e1a',
    borderBottom: '1px solid #1e2d4a',
    fontWeight: 600, whiteSpace: 'nowrap',
    zIndex: 1,
  },
  td: {
    padding: '5px 10px', color: 'var(--text-muted)',
    borderBottom: '1px solid rgba(30,45,74,0.3)',
  },
  row: {
    transition: 'background 0.1s',
  },
}
