import { useState, useEffect } from 'react'
import { websiteAPI, eventsAPI } from '../../services/api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const STATUS_COLORS = { ONLINE: '#10b981', CRITICAL: '#f59e0b', OFFLINE: '#ef4444' }

const StatusBadge = ({ status }) => {
  const c = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    CRITICAL: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    OFFLINE: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  }[status] || { bg: 'rgba(74,85,104,0.15)', color: '#4a5568', border: 'rgba(74,85,104,0.3)' }
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
      {status || 'PENDING'}
    </span>
  )
}

const InfoRow = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(30,45,74,0.5)' }}>
    <span style={{ fontSize: 11, color: '#4a6fa5', letterSpacing: '0.05em' }}>{label}</span>
    <span style={{ fontSize: 11, fontWeight: 600, color: valueColor || '#e2e8f0', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
  </div>
)

// ── Availability Timeline ─────────────────────────────────────

function AvailabilityTimeline({ websiteId }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!websiteId) return
    setLoading(true)
    eventsAPI.getByWebsite(websiteId, 100)
      .then(r => setEvents(r.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [websiteId])

  const fmtT = (d) => new Date(d).toLocaleString('id-ID', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmtDuration = (fromMs, toMs) => {
    const diff = toMs - fromMs
    if (diff < 0) return '—'
    const s = Math.floor(diff / 1000)
    if (s < 60)  return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60)  return `${m}m ${s % 60}s`
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }

  if (loading) return <div style={{ textAlign: 'center', color: '#4a5568', padding: 24, fontSize: 12 }}>Loading timeline...</div>
  if (!events.length) return <div style={{ textAlign: 'center', color: '#4a5568', padding: 24, fontSize: 12 }}>No status change events recorded yet.</div>

  // Build intervals: each event marks a transition
  // events are ordered DESC (newest first), reverse for chronological
  const sorted = [...events].reverse()

  return (
    <div>
      <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 12, letterSpacing: '0.05em' }}>
        {events.length} status change events — newest first
      </div>

      {/* Visual timeline */}
      <div style={{ position: 'relative', paddingLeft: 20, marginBottom: 20 }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: 'rgba(30,45,74,0.8)', borderRadius: 1 }} />

        {[...events].slice(0, 40).map((ev, i) => {
          const prevEv = events[i + 1]
          const duration = prevEv ? fmtDuration(new Date(prevEv.created_at).getTime(), new Date(ev.created_at).getTime()) : (i === 0 ? 'ongoing' : '—')
          const color = STATUS_COLORS[ev.new_status] || '#4a5568'

          return (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14, position: 'relative' }}>
              {/* Dot */}
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: color, flexShrink: 0,
                border: '2px solid #0f1629',
                boxShadow: `0 0 8px ${color}`,
                zIndex: 1,
              }} />

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color }}>
                    {ev.old_status} → {ev.new_status}
                  </span>
                  <span style={{ fontSize: 9, background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                    {ev.new_status}
                  </span>
                  <span style={{ fontSize: 9, color: '#4a5568', marginLeft: 'auto' }}>
                    Duration: {duration}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#4a6fa5' }}>
                  {ev.website_name} · {fmtT(ev.created_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Status bar visual */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 6, letterSpacing: '0.05em' }}>STATUS DURATION BAR</div>
        <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          {sorted.slice(-30).map((ev, i) => {
            const color = STATUS_COLORS[ev.new_status] || '#4a5568'
            const nextEv = sorted[i + 1]
            const from = new Date(ev.created_at).getTime()
            const to   = nextEv ? new Date(nextEv.created_at).getTime() : Date.now()
            const width = Math.max(3, Math.min(100 / sorted.length, 100))
            return (
              <div
                key={ev.id}
                title={`${ev.new_status}: ${fmtT(ev.created_at)}`}
                style={{ flex: 1, background: color, opacity: 0.8, transition: 'opacity 0.2s', minWidth: 3 }}
                onMouseEnter={e => e.target.style.opacity = '1'}
                onMouseLeave={e => e.target.style.opacity = '0.8'}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#4a5568' }}>
          <span>Oldest</span>
          <span>Newest</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {['ONLINE', 'CRITICAL', 'OFFLINE'].map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[s] }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Root Cause Section ────────────────────────────────────────

function RootCauseSection({ website }) {
  const [expanded, setExpanded] = useState(false)
  const rc = website.root_cause || (website.status === 'ONLINE' ? 'All checks passed' : 'Unknown')

  const CAUSES = {
    'DNS lookup failed': {
      color: '#ef4444',
      possible: ['DNS server unreachable', 'Domain name expired', 'Network routing issue', 'Misconfigured DNS record'],
    },
    'Connection timeout': {
      color: '#f59e0b',
      possible: ['Server is overloaded', 'Firewall blocking traffic', 'Network congestion', 'Application not responding'],
    },
    'Connection refused': {
      color: '#ef4444',
      possible: ['Service not running on expected port', 'Firewall rejecting connections', 'Application crashed', 'Port not listening'],
    },
    'SSL certificate expired or invalid': {
      color: '#f59e0b',
      possible: ['SSL certificate past expiry date', 'Certificate chain incomplete', 'Self-signed certificate', 'Hostname mismatch'],
    },
    'Response time above threshold': {
      color: '#f59e0b',
      possible: ['High server CPU/memory usage', 'Database query slowdown', 'Network latency spike', 'Insufficient server resources'],
    },
    'Service unreachable': {
      color: '#ef4444',
      possible: ['Server is down', 'Network outage', 'DDoS or traffic spike', 'Load balancer failure'],
    },
    'All checks passed': {
      color: '#10b981',
      possible: ['No issues detected', 'Service operating normally'],
    },
  }

  const info = CAUSES[rc] || { color: '#f59e0b', possible: ['Undetermined cause', 'Check server logs for details'] }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: '#4a6fa5', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>
        ROOT CAUSE ANALYSIS
      </div>
      <div style={{ background: info.color + '11', border: `1px solid ${info.color}44`, borderRadius: 6, padding: '10px 14px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: info.color }}>
            {rc === 'All checks passed' ? '✓' : '⚠'} {rc}
          </div>
          <button
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? 'HIDE DETAILS' : 'VIEW DETAILS'}
          </button>
        </div>

        {expanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${info.color}33` }}>
            <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 6, letterSpacing: '0.06em', fontWeight: 600 }}>
              POSSIBLE CAUSES
            </div>
            {info.possible.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                <span style={{ color: info.color, fontSize: 11, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p}</span>
              </div>
            ))}
            {rc !== 'All checks passed' && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 4, fontWeight: 600 }}>RECOMMENDED ACTIONS</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  1. Check server logs at the affected service<br />
                  2. Verify network connectivity and firewall rules<br />
                  3. Test manually: <code style={{ background: 'var(--bg-header)', padding: '1px 4px', borderRadius: 2 }}>curl -I {website.url}</code>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────

export default function ServiceDetailModal({ website, onClose }) {
  const [tab, setTab] = useState('overview')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!website) return
    setLoading(true)
    websiteAPI.getLogs(website.id, 100)
      .then(r => setLogs(r.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [website?.id])

  if (!website) return null

  const fmt = (ms) => ms != null ? `${ms}ms` : '—'
  const fmtTime = (d) => d ? new Date(d).toLocaleString('id-ID', { hour12: false }) : '—'

  const rtSeries = logs.filter(l => l.response_time_ms != null).map(l => l.response_time_ms)
  const avgRT  = rtSeries.length ? Math.round(rtSeries.reduce((a, b) => a + b, 0) / rtSeries.length) : null
  const maxRT  = rtSeries.length ? Math.max(...rtSeries) : null
  const minRT  = rtSeries.length ? Math.min(...rtSeries) : null
  const upLogs = logs.filter(l => l.status === 'ONLINE')
  const uptime = logs.length > 0 ? ((upLogs.length / logs.length) * 100).toFixed(2) : '—'
  const alerts = logs.filter(l => l.status === 'OFFLINE' || l.status === 'CRITICAL')

  // Performance chart data
  const perfData = [...logs].reverse().slice(-60).map((l, i) => ({
    i,
    rt: l.response_time_ms,
    status: l.status,
    time: fmtTime(l.checked_at),
  }))

  const domain = (() => { try { return new URL(website.url).hostname } catch { return website.url } })()
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  const initial = (website.name || 'W')[0].toUpperCase()

  const TABS = ['OVERVIEW', 'PERFORMANCE', 'TIMELINE', 'HISTORY', 'ALERTS']

  return (
    <div style={st.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={st.modal}>
        {/* Header */}
        <div style={st.header}>
          <div style={st.headerLeft}>
            <div style={st.favicon}>
              <img src={faviconUrl} width={24} height={24} alt=""
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
              <div style={{ ...st.initial, display: 'none' }}>{initial}</div>
            </div>
            <div>
              <div style={st.websiteName}>{website.name}</div>
              <div style={st.websiteUrl}>{website.url}</div>
            </div>
            <StatusBadge status={website.status} />
          </div>
          <button style={st.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={st.tabs}>
          {TABS.map(tb => (
            <button
              key={tb}
              style={{ ...st.tabBtn, ...(tab === tb.toLowerCase() ? st.tabActive : {}) }}
              onClick={() => setTab(tb.toLowerCase())}
            >
              {tb}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={st.body}>

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div>
              <InfoRow label="Service Name"        value={website.name} />
              <InfoRow label="URL"                 value={website.url} />
              <InfoRow label="IP Address"          value={website.ip_address || '—'} />
              <InfoRow label="Status"              value={<StatusBadge status={website.status} />} />
              <InfoRow label="HTTP Code"           value={website.status_code} />
              <InfoRow label="DNS Status"          value={website.dns_resolved === false ? '✗ Failed' : '✓ Resolved'} valueColor={website.dns_resolved === false ? '#ef4444' : '#10b981'} />
              <InfoRow label="SSL Status"          value={website.ssl_valid == null ? '—' : website.ssl_valid ? '✓ Valid' : '✗ Invalid'} valueColor={website.ssl_valid ? '#10b981' : '#ef4444'} />
              <InfoRow label="Response Time"       value={fmt(website.response_time_ms)} valueColor={website.response_time_ms > 3000 ? '#f59e0b' : '#10b981'} />
              <InfoRow label="Monitoring Interval" value={website.interval_seconds ? `${website.interval_seconds}s` : '—'} />
              <InfoRow label="Last Check"          value={fmtTime(website.last_checked)} />
              <InfoRow label="24h Sample Uptime"   value={`${uptime}%`} valueColor={parseFloat(uptime) > 99 ? '#10b981' : parseFloat(uptime) > 90 ? '#f59e0b' : '#ef4444'} />

              <RootCauseSection website={website} />
            </div>
          )}

          {/* ── PERFORMANCE ── */}
          {tab === 'performance' && (
            <div>
              {/* Performance mini cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Avg Response', value: fmt(avgRT), color: '#3b82f6' },
                  { label: 'Slowest',      value: fmt(maxRT), color: '#ef4444' },
                  { label: 'Fastest',      value: fmt(minRT), color: '#10b981' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: '0.08em' }}>{item.label.toUpperCase()}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: item.color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Response time chart */}
              <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 8, letterSpacing: '0.06em', fontWeight: 600 }}>
                RESPONSE TIME — LAST {perfData.length} CHECKS
              </div>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={perfData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,74,0.8)" />
                    <XAxis dataKey="i" tick={false} axisLine={{ stroke: 'var(--border)' }} />
                    <YAxis tick={{ fill: '#4a6fa5', fontSize: 9 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                    <Tooltip
                      content={({ active, payload }) => active && payload?.length ? (
                        <div style={{ background: 'var(--bg-header)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                          <div style={{ color: '#3b82f6', fontWeight: 600 }}>{payload[0].value}ms</div>
                          <div style={{ color: '#4a5568', fontSize: 9 }}>{payload[0].payload.time}</div>
                        </div>
                      ) : null}
                    />
                    <Line type="monotone" dataKey="rt" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Stats */}
              <div style={{ marginTop: 14 }}>
                {[
                  { label: 'Total Checks (sample)', value: logs.length },
                  { label: 'Successful Checks',     value: upLogs.length },
                  { label: 'Sample Uptime',         value: `${uptime}%` },
                  { label: 'Alert Events',          value: alerts.length },
                ].map(item => (
                  <InfoRow key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </div>
          )}

          {/* ── TIMELINE ── */}
          {tab === 'timeline' && (
            <AvailabilityTimeline websiteId={website.id} />
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            loading ? (
              <div style={{ textAlign: 'center', color: '#4a5568', padding: 24, fontSize: 12 }}>Loading...</div>
            ) : logs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#4a5568', padding: 24, fontSize: 12 }}>No history</div>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>{['Time', 'Status', 'HTTP', 'Response', 'SSL', 'DNS'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(30,45,74,0.2)' }}>
                      <td style={st.td}>{fmtTime(log.checked_at)}</td>
                      <td style={st.td}><span style={{ color: STATUS_COLORS[log.status] || '#4a5568', fontWeight: 600, fontSize: 10 }}>{log.status || '—'}</span></td>
                      <td style={st.td}>{log.status_code ?? '—'}</td>
                      <td style={st.td}>{fmt(log.response_time_ms)}</td>
                      <td style={st.td}>{log.ssl_valid == null ? '—' : log.ssl_valid ? '✓' : '✗'}</td>
                      <td style={st.td}>{log.dns_resolved == null ? '—' : log.dns_resolved ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* ── ALERTS ── */}
          {tab === 'alerts' && (
            alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#4a5568', padding: 24, fontSize: 12 }}>✅ No alerts for this service</div>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>{['Time', 'Status', 'Issue', 'HTTP', 'Response'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {alerts.map((log, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(30,45,74,0.2)' }}>
                      <td style={st.td}>{fmtTime(log.checked_at)}</td>
                      <td style={st.td}><span style={{ color: { CRITICAL: '#f59e0b', OFFLINE: '#ef4444' }[log.status] || '#4a5568', fontWeight: 600, fontSize: 10 }}>{log.status}</span></td>
                      <td style={st.td}>{log.status === 'OFFLINE' ? 'Service Unreachable' : 'Slow/Degraded'}</td>
                      <td style={st.td}>{log.status_code ?? '—'}</td>
                      <td style={st.td}>{fmt(log.response_time_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

        </div>
      </div>
    </div>
  )
}

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(30,41,59,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' },
  modal: { width: '660px', maxHeight: '85vh', background: 'var(--bg-header)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 10, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1e2d4a', background: 'rgba(255,255,255,0.97)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  favicon: { width: 36, height: 36, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  initial: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#3b82f6' },
  websiteName: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  websiteUrl: { fontSize: 10, color: '#4a5568', marginTop: 2 },
  closeBtn: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
  tabs: { display: 'flex', background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid #1e2d4a', flexShrink: 0 },
  tabBtn: { flex: 1, background: 'transparent', border: 'none', color: '#4a6fa5', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', padding: '8px 4px', cursor: 'pointer', borderBottom: '2px solid transparent', transition: 'all 0.15s' },
  tabActive: { color: '#3b82f6', borderBottom: '2px solid #3b82f6', background: 'rgba(59,130,246,0.05)' },
  body: { flex: 1, overflowY: 'auto', padding: '16px 18px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 9, color: '#4a6fa5', letterSpacing: '0.1em', borderBottom: '1px solid #1e2d4a', fontWeight: 600 },
  td: { padding: '7px 10px', color: 'var(--text-muted)', borderBottom: '1px solid rgba(30,45,74,0.4)', fontVariantNumeric: 'tabular-nums' },
}
