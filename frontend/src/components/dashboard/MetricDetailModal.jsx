import { useState } from 'react'

const StatusBadge = ({ status }) => {
  const c = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    CRITICAL: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    OFFLINE: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  }[status] || { bg: 'rgba(74,85,104,0.15)', color: '#4a5568', border: 'rgba(74,85,104,0.3)' }
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
      {status || 'PENDING'}
    </span>
  )
}

const fmt = (ms) => ms != null ? `${ms}ms` : '—'
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('id-ID', { hour12: false }) : '—'

export default function MetricDetailModal({ type, websites, summary, onClose }) {
  if (!type) return null

  const filtered = {
    ONLINE: websites.filter(w => w.status === 'ONLINE'),
    CRITICAL: websites.filter(w => w.status === 'CRITICAL'),
    OFFLINE: websites.filter(w => w.status === 'OFFLINE'),
    TOTAL: websites,
    ALERTS: websites.filter(w => w.status === 'OFFLINE' || w.status === 'CRITICAL'),
    'AVG RT': [...websites].sort((a, b) => (b.response_time_ms ?? 0) - (a.response_time_ms ?? 0)),
    SLA: websites,
  }[type] || websites

  const titles = {
    ONLINE: '🟢 Online Services',
    CRITICAL: '🟡 Critical Services',
    OFFLINE: '🔴 Offline Services',
    TOTAL: '📋 All Services',
    ALERTS: '🚨 Active Alerts',
    'AVG RT': '⚡ Response Time Ranking',
    SLA: '📈 SLA Overview',
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.title}>{titles[type]}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {type === 'SLA' ? (
          <div style={styles.body}>
            <div style={styles.slaCard}>
              <div style={styles.slaValue}>{Number(summary?.sla_percent ?? 0).toFixed(3)}%</div>
              <div style={styles.slaLabel}>Overall SLA</div>
            </div>
            <div style={{ marginTop: 16 }}>
              {websites.map((w, i) => {
                const sla = w.status === 'ONLINE' ? 100 : w.status === 'CRITICAL' ? 85 : 0
                return (
                  <div key={w.id} style={styles.slaRow}>
                    <span style={styles.slaName}>{w.name}</span>
                    <div style={styles.slaBar}>
                      <div style={{ ...styles.slaFill, width: `${sla}%`, background: sla > 99 ? '#10b981' : sla > 80 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text)', width: 50, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sla}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : type === 'AVG RT' ? (
          <div style={styles.body}>
            <table style={styles.table}>
              <thead>
                <tr>{['#', 'Service', 'URL', 'Response Time', 'Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((w, i) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                    <td style={{ ...styles.td, color: i < 3 ? '#f59e0b' : '#4a5568', fontWeight: 700 }}>{i + 1}</td>
                    <td style={styles.td}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{w.name}</span></td>
                    <td style={{ ...styles.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</td>
                    <td style={{ ...styles.td, color: w.response_time_ms > 3000 ? '#ef4444' : w.response_time_ms > 1000 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                      {fmt(w.response_time_ms)}
                    </td>
                    <td style={styles.td}><StatusBadge status={w.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : type === 'ALERTS' ? (
          <div style={styles.body}>
            {filtered.length === 0 ? (
              <div style={styles.noAlerts}>✅ No active alerts — all systems operational</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>{['Website', 'Status', 'Issue', 'Response', 'Last Check'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map((w, i) => (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      <td style={styles.td}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{w.name}</span></td>
                      <td style={styles.td}><StatusBadge status={w.status} /></td>
                      <td style={styles.td}>{w.status === 'OFFLINE' ? 'Service Unreachable' : 'Degraded Performance'}</td>
                      <td style={styles.td}>{fmt(w.response_time_ms)}</td>
                      <td style={styles.td}>{fmtTime(w.last_checked)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div style={styles.body}>
            <table style={styles.table}>
              <thead>
                <tr>{['Service', 'URL', 'Status', 'HTTP', 'Response', 'SSL', 'Last Check'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#4a5568', fontSize: 12 }}>No services found</td></tr>
                ) : filtered.map((w, i) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                    <td style={styles.td}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{w.name}</span></td>
                    <td style={{ ...styles.td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</td>
                    <td style={styles.td}><StatusBadge status={w.status} /></td>
                    <td style={styles.td}>{w.status_code ?? '—'}</td>
                    <td style={{ ...styles.td, color: w.response_time_ms > 3000 ? '#ef4444' : w.response_time_ms > 1000 ? '#f59e0b' : '#10b981' }}>
                      {fmt(w.response_time_ms)}
                    </td>
                    <td style={styles.td}>{w.ssl_valid == null ? '—' : w.ssl_valid ? '✓' : '✗'}</td>
                    <td style={styles.td}>{fmtTime(w.last_checked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9997,
    background: 'rgba(30,41,59,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(2px)',
  },
  modal: {
    width: 'min(780px, 95%)', maxHeight: '90vh',
    background: 'var(--bg-main)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
    overflow: 'hidden',
    animation: 'fadeIn 0.2s ease-out',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-header)',
    flexShrink: 0,
  },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  closeBtn: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    color: '#ef4444', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 12,
  },
  body: { flex: 1, overflowY: 'auto', padding: '16px 18px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    textAlign: 'left', padding: '8px 10px',
    fontSize: 9, color: 'var(--text-sub)', letterSpacing: '0.1em',
    borderBottom: '1px solid var(--border)', fontWeight: 800,
    background: 'var(--bg-header)',
  },
  td: {
    padding: '7px 10px', color: 'var(--text-sub)',
    borderBottom: '1px solid var(--border)',
    fontVariantNumeric: 'tabular-nums',
  },
  noAlerts: {
    textAlign: 'center', color: '#10b981', fontSize: 14,
    padding: '48px 0', fontWeight: 600,
  },
  slaCard: {
    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: 10, padding: '24px', textAlign: 'center',
  },
  slaValue: { fontSize: 48, fontWeight: 800, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' },
  slaLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' },
  slaRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  slaName: { fontSize: 11, color: 'var(--text-muted)', width: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slaBar: { flex: 1, height: 6, background: 'var(--bg-header)', borderRadius: 3, overflow: 'hidden' },
  slaFill: { height: '100%', borderRadius: 3, transition: 'width 0.5s' },
}
