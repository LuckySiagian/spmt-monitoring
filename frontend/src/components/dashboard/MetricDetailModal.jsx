import { useState } from 'react'
import { useTheme } from '../../store/theme'

const LOCALE_MAP = { id: 'id-ID', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU' }

const StatusBadge = ({ status }) => {
  const { tStatus } = useTheme()
  const c = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    WARNING: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    DEGRADED: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'rgba(249,115,22,0.3)' },
    CRITICAL: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    OFFLINE: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626', border: 'rgba(220,38,38,0.3)' },
  }[status] || { bg: 'rgba(74,85,104,0.15)', color: '#4a5568', border: 'rgba(74,85,104,0.3)' }
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
      {tStatus(status)}
    </span>
  )
}

const fmt = (ms) => ms != null ? `${ms}ms` : '—'

export default function MetricDetailModal({ type, websites, summary, onOpenDetail, onClose }) {
  if (!type) return null
  const { t, lang } = useTheme()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString(locale, { hour12: false }) : '—'

  const [sortKey, setSortKey] = useState(type === 'avg-rt' ? 'response_time_ms' : (type === 'sla' ? 'sla' : 'name'))
  const [sortDirection, setSortDirection] = useState(type === 'avg-rt' || type === 'sla' ? 'desc' : 'asc')

  const handleRowClick = (w) => {
    onOpenDetail?.(w)
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      const defaultDesc = ['response_time_ms', 'sla', 'last_checked', 'status_code'].includes(key)
      setSortDirection(defaultDesc ? 'desc' : 'asc')
    }
  }

  const filtered = {
    online: websites.filter(w => w.status === 'ONLINE'),
    critical: websites.filter(w => w.status === 'CRITICAL' || w.status === 'DEGRADED' || w.status === 'WARNING'),
    offline: websites.filter(w => w.status === 'OFFLINE'),
    total: websites,
    alerts: websites.filter(w => w.status !== 'ONLINE' && w.status !== 'UNKNOWN'),
    'avg-rt': websites,
    sla: websites,
  }[type] || websites

  const getSlaValue = w => {
    return w.status === 'ONLINE' ? 100 : w.status === 'DEGRADED' ? 95 : w.status === 'WARNING' ? 90 : w.status === 'CRITICAL' ? 80 : 0
  }

  const sortedList = [...filtered].sort((a, b) => {
    let aVal, bVal
    if (sortKey === 'name') {
      aVal = a.name || ''
      bVal = b.name || ''
    } else if (sortKey === 'url') {
      aVal = a.url || ''
      bVal = b.url || ''
    } else if (sortKey === 'status') {
      aVal = a.status || ''
      bVal = b.status || ''
    } else if (sortKey === 'status_code') {
      aVal = a.status_code ?? 0
      bVal = b.status_code ?? 0
    } else if (sortKey === 'response_time_ms') {
      aVal = a.response_time_ms ?? 0
      bVal = b.response_time_ms ?? 0
    } else if (sortKey === 'ssl_valid') {
      aVal = a.ssl_valid === true ? 1 : (a.ssl_valid === false ? -1 : 0)
      bVal = b.ssl_valid === true ? 1 : (b.ssl_valid === false ? -1 : 0)
    } else if (sortKey === 'last_checked') {
      aVal = a.last_checked ? new Date(a.last_checked).getTime() : 0
      bVal = b.last_checked ? new Date(b.last_checked).getTime() : 0
    } else if (sortKey === 'sla') {
      aVal = getSlaValue(a)
      bVal = getSlaValue(b)
    }

    if (aVal === bVal) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1

    if (typeof aVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal)
    } else {
      return sortDirection === 'asc'
        ? aVal - bVal
        : bVal - aVal
    }
  })

  const renderHeader = (label, key) => {
    const isSorted = sortKey === key
    return (
      <th 
        key={key} 
        style={{ 
          ...styles.th, 
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'color 0.2s'
        }}
        onClick={() => handleSort(key)}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-sub)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {label}
          <span style={{ fontSize: 9, opacity: isSorted ? 1 : 0.3 }}>
            {isSorted ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
          </span>
        </div>
      </th>
    )
  }

  const titles = {
    online: `🟢 ${t.mdOnline}`,
    critical: `🚨 ${t.mdCritical}`,
    offline: `🔴 ${t.mdOffline}`,
    total: `📋 ${t.mdAll}`,
    alerts: `🚨 ${t.mdAlerts}`,
    'avg-rt': `⚡ ${t.mdRtRank}`,
    sla: `📈 ${t.mdSla}`,
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.title}>{titles[type]}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {type === 'sla' ? (
          <div style={styles.body}>
            <div style={styles.slaCard}>
              <div style={styles.slaValue}>{Number(summary?.sla_percent ?? 0).toFixed(3)}%</div>
              <div style={styles.slaLabel}>{t.overallSla}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px 6px 14px', borderBottom: '1px solid var(--border)', marginTop: 20 }}>
              <span 
                style={{ fontSize: 10, fontWeight: 900, color: sortKey === 'name' ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => handleSort('name')}
              >
                {t.serviceNameCol} {sortKey === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
              </span>
              <span 
                style={{ fontSize: 10, fontWeight: 900, color: sortKey === 'sla' ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => handleSort('sla')}
              >
                {t.slaValueCol} {sortKey === 'sla' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              {sortedList.map((w, i) => {
                const sla = getSlaValue(w)
                return (
                  <div key={w.id} style={{ ...styles.slaRow, cursor: 'pointer', padding: '8px 14px' }} onClick={() => handleRowClick(w)}>
                    <span style={styles.slaName}>{w.name}</span>
                    <div style={styles.slaBar}>
                      <div style={{ ...styles.slaFill, width: `${sla}%`, background: sla > 99 ? '#10b981' : sla > 80 ? '#f59e0b' : '#f43f5e' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text)', width: 50, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sla}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : type === 'avg-rt' ? (
          <div style={styles.body}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  {renderHeader(t.colService, 'name')}
                  {renderHeader(t.colUrl, 'url')}
                  {renderHeader(t.colResponseTime, 'response_time_ms')}
                  {renderHeader(t.colStatus, 'status')}
                </tr>
              </thead>
              <tbody>
                {sortedList.map((w, i) => (
                  <tr 
                    key={w.id} 
                    onClick={() => handleRowClick(w)}
                    style={{ 
                      borderBottom: '1px solid var(--border)', 
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'}
                  >
                    <td style={{ ...styles.td, color: i < 3 ? '#f59e0b' : '#4a5568', fontWeight: 700 }}>{i + 1}</td>
                    <td style={styles.td}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{w.name}</span></td>
                    <td style={{ ...styles.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</td>
                    <td style={{ ...styles.td, color: w.response_time_ms > 10000 ? '#f43f5e' : w.response_time_ms > 3000 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                      {fmt(w.response_time_ms)}
                    </td>
                    <td style={styles.td}><StatusBadge status={w.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : type === 'alerts' ? (
          <div style={styles.body}>
            {sortedList.length === 0 ? (
              <div style={styles.noAlerts}>{t.noActiveAlerts}</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    {renderHeader(t.colWebsite, 'name')}
                    {renderHeader(t.colStatus, 'status')}
                    {renderHeader(t.colIssue, 'status')}
                    {renderHeader(t.colResponse, 'response_time_ms')}
                    {renderHeader(t.colLastCheck, 'last_checked')}
                  </tr>
                </thead>
                <tbody>
                  {sortedList.map((w, i) => (
                    <tr 
                      key={w.id} 
                      onClick={() => handleRowClick(w)}
                      style={{ 
                        borderBottom: '1px solid var(--border)', 
                        background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'}
                    >
                      <td style={styles.td}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{w.name}</span></td>
                      <td style={styles.td}><StatusBadge status={w.status} /></td>
                      <td style={styles.td}>
                        {w.status === 'OFFLINE' ? t.issueUnreachable :
                         w.status === 'CRITICAL' ? t.issueCriticalFail :
                         w.status === 'WARNING' ? t.issueStability : t.issueDegraded}
                      </td>
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
                <tr>
                  {renderHeader(t.colService, 'name')}
                  {renderHeader(t.colUrl, 'url')}
                  {renderHeader(t.colStatus, 'status')}
                  {renderHeader(t.colHttp, 'status_code')}
                  {renderHeader(t.colResponse, 'response_time_ms')}
                  {renderHeader(t.colSsl, 'ssl_valid')}
                  {renderHeader(t.colLastCheck, 'last_checked')}
                </tr>
              </thead>
              <tbody>
                {sortedList.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#4a5568', fontSize: 12 }}>{t.noServicesFound}</td></tr>
                ) : sortedList.map((w, i) => (
                  <tr 
                    key={w.id} 
                    onClick={() => handleRowClick(w)}
                    style={{ 
                      borderBottom: '1px solid var(--border)', 
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'}
                  >
                    <td style={styles.td}><span style={{ color: 'var(--text)', fontWeight: 600 }}>{w.name}</span></td>
                    <td style={{ ...styles.td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</td>
                    <td style={styles.td}><StatusBadge status={w.status} /></td>
                    <td style={styles.td}>{w.status_code ?? '—'}</td>
                    <td style={{ ...styles.td, color: w.response_time_ms > 10000 ? '#f43f5e' : w.response_time_ms > 3000 ? '#f59e0b' : '#10b981' }}>
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
    width: 'min(900px, 95%)',
    height: 'min(720px, 85vh)',
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
