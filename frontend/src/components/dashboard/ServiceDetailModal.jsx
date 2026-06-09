import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { websiteAPI, eventsAPI } from '../../services/api'
import { useGlobalWebSocket } from '../../store/WebSocketContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Copy, Check } from 'lucide-react'

const STATUS_COLORS = {
  ONLINE: '#10b981',
  WARNING: '#10b981',
  DEGRADED: '#10b981',
  CRITICAL: '#eab308',
  OFFLINE: '#dc2626',
  UNKNOWN: '#64748b'
}


import StatusBadgeIcon from '../common/StatusBadgeIcon'

const StatusBadge = ({ status }) => {
  const c = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    WARNING: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    DEGRADED: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    CRITICAL: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', border: 'rgba(234,179,8,0.3)' },
    OFFLINE: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626', border: 'rgba(220,38,38,0.3)' },
  }[status] || { bg: 'rgba(74,85,104,0.15)', color: '#4a5568', border: 'rgba(74,85,104,0.3)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {status || 'PENDING'}
      <StatusBadgeIcon status={status} />
    </span>
  )
}

const InfoRow = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{label}</span>
    <span style={{ fontSize: 11, fontWeight: 700, color: valueColor || 'var(--text)', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
  </div>
)

// ── Availability Timeline ─────────────────────────────────────

function AvailabilityTimeline({ websiteId }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(async (silent = false) => {
    if (!websiteId) return
    const controller = new AbortController()
    if (!silent) setLoading(true)
    try {
      const r = await eventsAPI.getByWebsite(websiteId, 100, { signal: controller.signal })
      setEvents(r.data || [])
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') setEvents([])
    } finally {
      if (!silent) setLoading(false)
    }
    return () => controller.abort()
  }, [websiteId])

  useEffect(() => {
    const cleanup = fetchEvents()
    return () => { if (typeof cleanup === 'function') cleanup() }
  }, [fetchEvents])

  useGlobalWebSocket(useCallback((msg) => {
    if (msg.type === 'status_change' && (msg.payload.website_id === websiteId || msg.payload.WebsiteID === websiteId)) {
      fetchEvents(true)
    }
  }, [websiteId, fetchEvents]))

  const fmtT = (d) => new Date(d).toLocaleString('id-ID', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmtDuration = (fromMs, toMs) => {
    const diff = toMs - fromMs
    if (diff < 0) return '—'
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ${s % 60}s`
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
        <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: 'var(--border)', borderRadius: 1 }} />

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
                border: '2px solid var(--bg-main)',
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
            const to = nextEv ? new Date(nextEv.created_at).getTime() : Date.now()
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
        {['ONLINE', 'DEGRADED', 'WARNING', 'CRITICAL', 'OFFLINE'].map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[s] }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


const getDnsStatus = (status, resolved) => {
  if (resolved) {
    return '🟢 Terhubung ke IP'
  }
  if (status === 'OFFLINE') {
    return '❌ Gagal (Domain Tidak Terurai)'
  }
  return '🟢 Sukses (Normal)'
}

const getHttpCodeValue = (status, code, rootCause = '') => {
  const rc = String(rootCause || '').toUpperCase()
  if (rc.includes('BLOKIR') || rc.includes('POSITIF') || rc.includes('ISP') || rc.includes('ADUAN')) {
    return '— (Akses Diblokir / Koneksi Diintersepsi)'
  }
  if (status === 'OFFLINE') {
    return '— (Request Time Out / Connection Refused)'
  }
  if (!code) return '— (Request Time Out / Connection Refused)'
  if (code === 200) return '200 OK'
  if (code === 201) return '201 Created'
  if (code === 301) return '301 Moved Permanently'
  if (code === 302) return '302 Found'
  if (code === 400) return '400 Bad Request'
  if (code === 401) return '401 Unauthorized'
  if (code === 403) return '403 Forbidden'
  if (code === 404) return '404 Not Found'
  if (code === 500) return '500 Internal Server Error'
  if (code === 502) return '502 Bad Gateway'
  if (code === 503) return '503 Service Unavailable'
  if (code === 504) return '504 Gateway Timeout'
  return `${code}`
}

const getLatencyDesc = (ms) => {
  if (!ms) return 'Tidak Terdeteksi'
  if (ms < 300) return 'Sangat Cepat'
  if (ms < 1000) return 'Normal (Standar)'
  if (ms < 3000) return 'Lambat'
  return 'Sangat Lambat'
}

const getSslStatusText = (status, valid, expiryStr, rootCause = '') => {
  const rc = String(rootCause || '').toUpperCase()

  // 1. Deteksi Intersepsi atau Proksi Kantor (Priority)
  if (rc.includes('PROKSI') || rc.includes('PROXY') || rc.includes('INTERSEPSI') || rc.includes('UNTRUSTED') || rc.includes('DIINTERSEPSI') || rc.includes('DIINTIP')) {
    return '🟠 Peringatan (Keamanan Dipantau Jaringan / Proksi)'
  }

  // 2. Deteksi Mixed Content
  if (rc.includes('MIXED CONTENT')) {
    return '🟡 Peringatan (Mixed Content / Tidak Sepenuhnya Aman)'
  }

  // 3. Deteksi Redirect Loop
  if (rc.includes('REDIRECTS') || rc.includes('REDIRECT_LOOP')) {
    return '❌ Gagal (Too Many Redirects)'
  }

  if (rc.includes('BLOKIR') || rc.includes('POSITIF') || rc.includes('ISP') || rc.includes('ADUAN')) {
    return '❌ Gagal (Keamanan Diintersepsi ISP)'
  }
  if (status === 'OFFLINE') {
    return '— (Tidak Dapat Diperiksa)'
  }
  if (valid === false) {
    return '❌ Tidak Aktif (Kadaluarsa / Hostname Mismatch)'
  }
  if (!expiryStr) {
    return '— (Tidak Dicek / Non-HTTPS)'
  }

  try {
    const expiry = new Date(expiryStr)
    if (isNaN(expiry.getTime())) return '— (Tidak Dicek / Non-HTTPS)'

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expiry.setHours(0, 0, 0, 0)

    const diffTime = expiry.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    const day = String(expiry.getDate()).padStart(2, '0')
    const month = String(expiry.getMonth() + 1).padStart(2, '0')
    const year = expiry.getFullYear()
    const formattedDate = `${day}/${month}/${year}`

    if (diffDays < 0) {
      return `❌ Tidak Aktif (Kadaluarsa pada ${formattedDate} — ${Math.abs(diffDays)} Hari yang Lalu)`
    } else if (diffDays === 0) {
      return `🟢 Aktif (Kadaluarsa Hari Ini — valid s.d ${formattedDate})`
    } else {
      return `🟢 Aktif (Valid s.d ${formattedDate} — ${diffDays} Hari Lagi)`
    }
  } catch (err) {
    return valid ? '🟢 Aktif (Sertifikat Valid)' : '— (Tidak Dicek / Non-HTTPS)'
  }
}


const isPrivateIP = (ip) => {
  if (!ip) return false
  // 192.168.x.x
  if (/^192\.168\./.test(ip)) return true
  // 10.x.x.x
  if (/^10\./.test(ip)) return true
  // 172.16-31.x.x
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true
  // 127.x.x.x (loopback)
  if (/^127\./.test(ip)) return true
  return false
}

const extractHostingProvider = (asnStr) => {
  if (!asnStr || asnStr === 'Unknown') return 'Unknown'
  if (asnStr.includes('(') && asnStr.includes(')')) {
    const start = asnStr.indexOf('(')
    const end = asnStr.indexOf(')')
    if (start < end) {
      return asnStr.substring(start + 1, end)
    }
  }
  const parts = asnStr.split(/\s+/)
  if (parts.length > 1 && parts[0].toUpperCase().startsWith('AS')) {
    return parts.slice(1).join(' ')
  }
  return asnStr
}

function AnalisisKondisi({ website, sysHealth }) {
  return null
}

// ── Evidence Collection Viewer ───────────────────────────────────────

function EvidenceViewer({ website }) {
  return null
}


// ── Root Cause Section ────────────────────────────────────────

function RootCauseSection({ website }) {
  return null
}

// ── Main Modal ────────────────────────────────────────────────

export default function ServiceDetailModal({ website, onClose }) {
  const [tab, setTab] = useState('overview')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [sla, setSla] = useState(null)
  const [slaLoading, setSlaLoading] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const latestLog = logs[0]
  const rootCauseStr = latestLog?.root_cause || website.root_cause
  let ev = null
  try { ev = JSON.parse(rootCauseStr || '') } catch (_) {}

  // Find the most recent screenshot in the logs history if the latest one is empty
  let screenshot = ev?.screenshot
  if (!screenshot && logs.length > 0) {
    for (const logItem of logs) {
      if (logItem.root_cause) {
        try {
          const parsed = JSON.parse(logItem.root_cause)
          if (parsed && parsed.screenshot) {
            screenshot = parsed.screenshot
            break
          }
        } catch (_) {}
      }
    }
  }

  const handleCopyScreenshot = useCallback(async () => {
    if (!screenshot) return
    try {
      const byteCharacters = atob(screenshot);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy image: ', err);
      alert('Gagal menyalin gambar ke clipboard: ' + err.message);
    }
  }, [screenshot])

  const fetchLogs = useCallback(async (silent = false) => {
    if (!website?.id) return
    const controller = new AbortController()
    if (!silent) setLoading(true)
    try {
      const r = await websiteAPI.getLogs(website.id, 100, { signal: controller.signal })
      setLogs(r.data || [])
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') setLogs([])
    } finally {
      if (!silent) setLoading(false)
    }
    return () => controller.abort()
  }, [website?.id])

  const fetchSLA = useCallback(async () => {
    if (!website?.id) return
    setSlaLoading(true)
    try {
      const r = await websiteAPI.getSLA(website.id)
      setSla(r.data)
    } catch (err) {
      console.error("Failed to fetch SLA data:", err)
    } finally {
      setSlaLoading(false)
    }
  }, [website?.id])

  useEffect(() => {
    fetchLogs()
    fetchSLA()
  }, [fetchLogs, fetchSLA])

  // WebSocket Sync for Logs
  useGlobalWebSocket(useCallback((msg) => {
    if ((msg.type === 'monitor_update' || msg.type === 'status_change') && msg.payload.website_id === website?.id) {
      fetchLogs(true) // Silent update
      fetchSLA()
    }
  }, [website?.id, fetchLogs, fetchSLA]))

  if (!website) return null

  const fmt = (ms) => {
    if (ms === null || ms === undefined) return '—'
    if (ms === 0) return '< 1ms'
    return `${ms}ms`
  }
  const fmtTime = (d) => d ? new Date(d).toLocaleString('id-ID', { hour12: false }) : '—'

  const { avgRT, maxRT, minRT, uptime, alerts, perfData, upLogsCount } = useMemo(() => {
    const rtSeries = logs.filter(l => l.response_time_ms != null).map(l => l.response_time_ms)
    const avg = rtSeries.length ? Math.round(rtSeries.reduce((a, b) => a + b, 0) / rtSeries.length) : null
    const max = rtSeries.length ? Math.max(...rtSeries) : null
    const min = rtSeries.length ? Math.min(...rtSeries) : null
    const upLogs = logs.filter(l => l.status === 'ONLINE')
    const ut = logs.length > 0 ? ((upLogs.length / logs.length) * 100).toFixed(2) : '—'
    const al = logs.filter(l => l.status === 'OFFLINE' || l.status === 'CRITICAL')

    const pd = [...logs].reverse().slice(-60).map((l, i) => ({
      i,
      rt: l.response_time_ms,
      status: l.status,
      time: fmtTime(l.checked_at),
    }))

    return { avgRT: avg, maxRT: max, minRT: min, uptime: ut, alerts: al, perfData: pd, upLogsCount: upLogs.length }
  }, [logs])

  const domain = (() => { try { return new URL(website.url).hostname } catch { return website.url } })()
  const shouldSkip = /^(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(domain) ||
    domain.endsWith('.pelindo.co.id') ||
    domain.endsWith('.pelindomultiterminal.co.id')

  const faviconUrl = shouldSkip ? null : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  const initial = (website.name || 'W')[0].toUpperCase()

  const TABS = ['OVERVIEW', 'PERFORMANCE', 'TIMELINE', 'HISTORY']

  return (
    <div style={st.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={st.modal}>
        {/* Header */}
        <div style={st.header}>
          <div style={st.headerLeft}>
            <div style={st.favicon}>
              {faviconUrl ? (
                <img src={faviconUrl} width={24} height={24} alt=""
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
              ) : null}
              <div style={{ ...st.initial, display: shouldSkip ? 'flex' : 'none' }}>{initial}</div>
            </div>
            <div>
              <div style={st.websiteName}>{website.name}</div>
              <a href={website.url} target="_blank" rel="noopener noreferrer"
                style={{ ...st.websiteUrl, color: 'var(--accent)', textDecoration: 'none', cursor: 'pointer', display: 'block' }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {website.url} ↗
              </a>
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
          {tab === 'overview' && (() => {
            const ipClass = ev?.ip_classification
            const ipColor = ipClass === 'PRIVATE' ? '#f59e0b' : ipClass === 'PUBLIC' ? '#10b981' : 'var(--text-muted)'
            const sslOk = ev?.tls_handshake_ok
            const sslColor = sslOk === false ? '#ef4444' : sslOk ? '#10b981' : 'var(--text-muted)'
            const code = ev?.http_status_code
            const codeColor = !code ? 'var(--text-muted)' : code >= 500 ? '#ef4444' : code >= 400 ? '#f59e0b' : '#10b981'
            const rt = ev?.response_time_ms ?? website.response_time_ms
            const rtColor = !rt ? 'var(--text-muted)' : rt > 5000 ? '#ef4444' : rt > 2000 ? '#f59e0b' : '#10b981'

            const fmtTimeOnly = (d) => {
              if (!d) return '—'
              try {
                return new Date(d).toLocaleTimeString('id-ID', { hour12: false })
              } catch {
                return '—'
              }
            }

            const fmtDateLong = (dateStr) => {
              if (!dateStr) return '—'
              try {
                const d = new Date(dateStr)
                if (isNaN(d.getTime())) return '—'
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                const day = String(d.getDate()).padStart(2, '0')
                const month = months[d.getMonth()]
                const year = d.getFullYear()
                return `${day} ${month} ${year}`
              } catch {
                return '—'
              }
            }

            const getRemainingDays = (dateStr) => {
              if (!dateStr) return '—'
              try {
                const expiry = new Date(dateStr)
                if (isNaN(expiry.getTime())) return '—'
                const today = new Date()
                today.setHours(0,0,0,0)
                expiry.setHours(0,0,0,0)
                const diff = expiry - today
                const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
                return days > 0 ? `${days} Days` : (days === 0 ? 'Today' : 'Expired')
              } catch {
                return '—'
              }
            }

            const CardBox = ({ title, children }) => (
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{
                  background: 'rgba(30,41,59,0.02)',
                  borderBottom: '1px solid var(--border)',
                  padding: '8px 14px',
                  fontSize: 10,
                  fontWeight: 900,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}>
                  {title}
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {children}
                </div>
              </div>
            )

            const CardRow = ({ label, value, valueColor, desc }) => (
              <div style={{
                padding: '6px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: 3
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12
                }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.02em', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontWeight: 700, color: valueColor || 'var(--text)', textAlign: 'right', fontSize: 12 }}>{value ?? '—'}</span>
                </div>
                {desc && (
                  <div style={{
                    fontSize: 9.5,
                    color: 'rgba(156, 163, 175, 0.85)',
                    lineHeight: 1.35,
                    background: 'rgba(30, 41, 59, 0.15)',
                    padding: '4px 8px',
                    borderRadius: 4,
                    borderLeft: '2px solid rgba(99, 102, 241, 0.4)',
                    marginTop: 2,
                    textAlign: 'left'
                  }}>
                    {desc}
                  </div>
                )}
              </div>
            )

            const status = latestLog?.status || website.status || 'UNKNOWN';
            const isOnline = status === 'ONLINE';
            const isCrit = status === 'CRITICAL';
            const isMigrated = !!ev?.is_migrated;

            const boxBg = isMigrated
              ? 'rgba(245, 158, 11, 0.05)'
              : isOnline 
                ? 'rgba(16, 185, 129, 0.05)' 
                : isCrit 
                  ? 'rgba(234, 179, 8, 0.05)' 
                  : 'rgba(239, 68, 68, 0.05)';

            const boxBorder = isMigrated
              ? 'rgba(245, 158, 11, 0.18)'
              : isOnline 
                ? 'rgba(16, 185, 129, 0.15)' 
                : isCrit 
                  ? 'rgba(234, 179, 8, 0.15)' 
                  : 'rgba(239, 68, 68, 0.15)';

            const boxColor = isMigrated
              ? '#f59e0b'
              : isOnline 
                ? '#10b981' 
                : isCrit 
                  ? '#eab308' 
                  : '#ef4444';

            let statusText = 'ONLINE (Normal)';
            if (isMigrated) statusText = 'ONLINE (Migrasi)';
            else if (isCrit) statusText = 'CRITICAL (Bermasalah)';
            else if (status === 'OFFLINE') statusText = 'OFFLINE (Terputus)';

            const getStatusDesc = (status) => {
              if (status === 'ONLINE') return 'Website berjalan normal dan dapat diakses publik dengan lancar.'
              if (status === 'CRITICAL') return 'Website mengalami gangguan serius (seperti respon lambat atau SSL tidak valid).'
              if (status === 'OFFLINE') return 'Website terputus sepenuhnya. Server tidak merespon koneksi atau mati.'
              return 'Kondisi operasional website belum dapat ditentukan.'
            }

            const getHttpDesc = (code, error) => {
              if (error) return `Koneksi gagal dilakukan: ${error}.`
              if (!code) return 'Tidak menerima respon HTTP dari server (koneksi ditolak atau RTO).'
              if (code === 200) return 'HTTP 200 OK: Permintaan sukses. Server memproses halaman dengan lancar.'
              if (code === 403) return 'HTTP 403 Forbidden: Akses ditolak sistem keamanan server/WAF.'
              if (code === 401) return 'HTTP 401 Unauthorized: Halaman terkunci dan memerlukan otentikasi login.'
              if (code === 404) return 'HTTP 404 Not Found: Alamat halaman utama tidak ditemukan di server.'
              if (code >= 500) return `HTTP ${code}: Server mengalami error internal/crash saat memproses halaman.`
              return `HTTP ${code}: Server merespons dengan kode status ini.`
            }

            const getResponseTimeDesc = (time) => {
              if (!time) return 'Waktu respon tidak terukur karena koneksi ke server gagal.'
              if (time < 300) return `Respon sangat cepat (${time} ms). Server dalam kondisi prima.`
              if (time < 1000) return `Respon normal (${time} ms). Kecepatan muat halaman memenuhi standar.`
              if (time < 3000) return `Respon lambat (${time} ms). Server memerlukan waktu lebih lama untuk memproses.`
              return `Respon sangat lambat (${time} ms). Berpotensi mengganggu kenyamanan pengguna.`
            }

            const getTtfbDesc = (time) => {
              if (!time) return 'TTFB tidak terukur karena server gagal merespons.'
              return `TTFB (${time} ms) adalah kecepatan server memproses instruksi awal halaman sebelum mengirim data.`
            }

            const getPingDesc = (status, latency, tcpLat) => {
              if (status === false) return 'Ping gagal (Request Time Out). Protokol ICMP diblokir firewall server/hosting.'
              const latVal = latency || tcpLat
              if (!latVal) return 'Ping tidak terukur.'
              return `Ping sukses (${latVal} ms). Sinyal jaringan dasar ke server terhubung dengan baik.`
            }

            const getDnsDesc = (resolved) => {
              if (resolved) return 'Penerjemahan nama domain ke alamat IP angka server berhasil.'
              return 'Gagal menerjemahkan domain. Konfigurasi DNS bermasalah atau domain mati.'
            }

            const getDnsTimeDesc = (time) => {
              if (!time) return 'DNS Lookup gagal dilakukan.'
              return `Nama domain diterjemahkan ke alamat IP dalam waktu ${time} ms. Makin cepat makin baik.`
            }

            const getIpDesc = (ip) => {
              if (!ip) return 'IP Address tidak ditemukan.'
              const isV6 = ip.includes(':')
              return `Alamat IP server: ${ip} (${isV6 ? 'menggunakan IPv6 terbaru' : 'menggunakan IPv4 biasa'}).`
            }

            const getSslDesc = (valid) => {
              if (valid) return 'Sertifikat SSL valid. Jalur data aman & terenkripsi (melindungi informasi sensitif).'
              if (valid === false) return 'SSL tidak valid/rusak. Browser pengguna akan menampilkan peringatan bahaya.'
              return 'Website menggunakan HTTP biasa (tidak aman, rentan penyadapan).'
            }

            const getExpiryDesc = (dateStr) => {
              if (!dateStr) return 'Masa aktif sertifikat tidak terdeteksi.'
              return `Sertifikat SSL website ini berlaku secara legal hingga tanggal ${fmtDateLong(dateStr)}.`
            }

            const getRemainingDesc = (dateStr) => {
              const days = getRemainingDays(dateStr)
              if (days === '—') return 'Tidak terdeteksi.'
              if (days === 'Expired') return 'Sertifikat SSL sudah kedaluwarsa! Harap segera diperbarui.'
              if (days === 'Today') return 'Sertifikat SSL kedaluwarsa hari ini! Perbarui segera.'
              return `Sertifikat SSL aman untuk ${days} berikutnya sebelum masa berlaku habis.`
            }

            const getServerDesc = (server) => {
              if (!server || server === 'Unknown') return 'Jenis perangkat lunak server tidak diumumkan ke publik (untuk keamanan).'
              return `Website dilayani oleh aplikasi web server ${server}.`
            }

            const getProviderDesc = (provider) => {
              if (!provider || provider === 'Unknown') return 'Nama penyedia hosting/jaringan tidak dapat diidentifikasi.'
              return `Server website diletakkan di infrastruktur milik perusahaan ${provider}.`
            }

            return (
              <div>
                {/* 1. KONDISI WEBSITE */}
                <div style={{
                  marginBottom: 20,
                  padding: '16px 20px',
                  background: boxBg,
                  border: `1px solid ${boxBorder}`,
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: boxColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      📋 KONDISI WEBSITE
                    </div>
                    <span style={{ 
                      fontSize: 10, 
                      fontWeight: 800, 
                      color: boxColor, 
                      background: `${boxColor}15`, 
                      border: `1px solid ${boxColor}33`, 
                      padding: '2px 8px', 
                      borderRadius: 4,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase'
                    }}>
                      {statusText}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {latestLog?.recommendation || website.recommendation || 'Halo! Sistem sedang menyiapkan penjelasan kondisi website Anda. Mohon tunggu sejenak.'}
                  </div>
                </div>

                {/* 2. BOT CHROME */}
                {screenshot ? (
                  <div style={{
                    marginBottom: 20,
                    padding: '16px 20px',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: 12 
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        📸 BOT CHROME
                      </div>
                      <button
                        onClick={handleCopyScreenshot}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: copied ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                          border: copied ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                          color: copied ? '#10b981' : '#6366f1',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Tersalin!' : 'Copy Screenshot'}
                      </button>
                    </div>
                    <img 
                      src={`data:image/png;base64,${screenshot}`} 
                      alt="Website screenshot preview" 
                      onClick={() => setIsZoomed(true)}
                      style={{ 
                        width: '100%', 
                        borderRadius: 8, 
                        border: '1px solid var(--border)',
                        display: 'block',
                        maxHeight: '350px',
                        objectFit: 'contain',
                        backgroundColor: '#f8fafc',
                        cursor: 'zoom-in',
                        transition: 'transform 0.2s'
                      }} 
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                  </div>
                ) : null}

                {/* 3. FOUR CARDS (Service Health Overview, Connectivity, Security, Infrastructure) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <CardBox title="SERVICE HEALTH">
                    <CardRow label="Status" value={statusText} valueColor={boxColor} desc={getStatusDesc(latestLog?.status || website.status)} />
                    <CardRow label="HTTP Code" value={getHttpCodeValue(latestLog?.status || website.status, code, ev?.http_error)} valueColor={codeColor} desc={getHttpDesc(code, ev?.http_error)} />
                    <CardRow label="Response Time" value={rt ? `${rt} ms` : '—'} valueColor={rtColor} desc={getResponseTimeDesc(rt)} />
                    <CardRow label="TTFB" value={ev?.ttfb_ms ? `${ev.ttfb_ms} ms` : (latestLog?.ttfb_latency_ms ? `${latestLog.ttfb_latency_ms} ms` : '—')} desc={getTtfbDesc(ev?.ttfb_ms || latestLog?.ttfb_latency_ms)} />
                    <CardRow label="Last Check" value={fmtTimeOnly(latestLog?.checked_at || website.last_checked)} desc={fmtTimeOnly(latestLog?.checked_at || website.last_checked) !== '—' ? 'Waktu terakhir sistem memvalidasi keadaan website ini.' : 'Pengecekan belum dilakukan.'} />
                  </CardBox>

                  <CardBox title="CONNECTIVITY">
                    <CardRow 
                      label="ICMP Ping" 
                      value={latestLog?.icmp_status === false ? 'Failed' : (latestLog?.icmp_latency_ms ? `${latestLog.icmp_latency_ms} ms` : (ev?.icmp_latency_ms ? `${ev.icmp_latency_ms} ms` : '—'))} 
                      valueColor={latestLog?.icmp_status === false ? '#ef4444' : '#10b981'} 
                      desc={getPingDesc(latestLog?.icmp_status ?? ev?.icmp_status, latestLog?.icmp_latency_ms ?? ev?.icmp_latency_ms, ev?.tcp_latency_ms)}
                    />
                    <CardRow label="DNS Status" value={ev?.dns_resolved ? 'Resolved' : 'Failed'} valueColor={ev?.dns_resolved ? '#10b981' : '#ef4444'} desc={getDnsDesc(ev?.dns_resolved)} />
                    <CardRow label="DNS Lookup Time" value={ev?.dns_latency_ms ? `${ev.dns_latency_ms} ms` : (latestLog?.dns_latency_ms ? `${latestLog.dns_latency_ms} ms` : '—')} desc={getDnsTimeDesc(ev?.dns_latency_ms || latestLog?.dns_latency_ms)} />
                    <CardRow label="IP Address" value={ev?.ip_address || website.ip_address || '—'} desc={getIpDesc(ev?.ip_address || website.ip_address)} />
                  </CardBox>

                  <CardBox title="SECURITY">
                    <CardRow label="SSL Status" value={ev?.tls_handshake_ok ? 'Valid' : (ev?.tls_handshake_ok === false ? 'Invalid' : '—')} valueColor={sslColor} desc={getSslDesc(ev?.tls_handshake_ok)} />
                    <CardRow label="Expiration Date" value={ev?.tls_cert_expiry ? fmtDateLong(ev.tls_cert_expiry) : (website.ssl_expiry_date ? fmtDateLong(website.ssl_expiry_date) : '—')} desc={getExpiryDesc(ev?.tls_cert_expiry || website.ssl_expiry_date)} />
                    <CardRow label="Remaining Days" value={ev?.tls_cert_expiry ? getRemainingDays(ev.tls_cert_expiry) : (website.ssl_expiry_date ? getRemainingDays(website.ssl_expiry_date) : '—')} desc={getRemainingDesc(ev?.tls_cert_expiry || website.ssl_expiry_date)} />
                  </CardBox>

                  <CardBox title="INFRASTRUCTURE">
                    <CardRow label="Server" value={ev?.server_header || 'Unknown'} desc={getServerDesc(ev?.server_header)} />
                    <CardRow label="Hosting Provider" value={ev?.hosting_provider || (ev?.hosting_asn ? extractHostingProvider(ev.hosting_asn) : 'Unknown')} desc={getProviderDesc(ev?.hosting_provider || (ev?.hosting_asn ? extractHostingProvider(ev.hosting_asn) : 'Unknown'))} />
                  </CardBox>
                </div>

                {/* 3.5 PANDUAN PARAMETER UNTUK AWAM */}
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 20,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                }}>
                  <div 
                    onClick={() => setShowGuide(!showGuide)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em'
                    }}
                  >
                    <span>💡 PENJELASAN PARAMETER JARINGAN & WEB (UNTUK AWAM)</span>
                    <span style={{ fontSize: 10 }}>{showGuide ? 'SEMBUNYIKAN ▲' : 'TAMPILKAN ▼'}</span>
                  </div>
                  
                  {showGuide && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--accent)' }}>Service Health (Kesehatan Layanan):</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          <li><strong>Status:</strong> Kondisi operasional website saat ini (Normal/Bermasalah/Terputus).</li>
                          <li><strong>HTTP Code:</strong> Kode respon server. 200 berarti sukses. 403 berarti akses ditolak sistem keamanan (Forbidden). 404 berarti halaman tidak ditemukan. 500-504 berarti server aplikasi crash/rusak.</li>
                          <li><strong>Response Time:</strong> Seberapa cepat server mengirim balasan halaman web (dalam milidetik). Makin kecil makin responsif.</li>
                          <li><strong>TTFB (Time to First Byte):</strong> Waktu tunggu sampai server mengirimkan bit data pertama. Mengukur kecepatan server memproses instruksi.</li>
                        </ul>
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--accent)' }}>Connectivity (Konektivitas):</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          <li><strong>ICMP Ping:</strong> Tes ketukan pintu jaringan ke server untuk mengecek apakah server aktif merespons sinyal dasar. Menggunakan data ping asli.</li>
                          <li><strong>DNS Status & Lookup Time:</strong> Status dan kecepatan menerjemahkan alamat web (misal: google.com) menjadi koordinat IP angka server.</li>
                          <li><strong>IP Address:</strong> Alamat unik server di jaringan internet (seperti nomor rumah/telepon).</li>
                        </ul>
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--accent)' }}>Security (Keamanan):</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          <li><strong>SSL Status:</strong> Status keamanan enkripsi koneksi. Jika aktif (Valid), menjamin lalu lintas data aman dan tidak bisa diintip orang lain.</li>
                          <li><strong>Expiration & Remaining:</strong> Batas masa berlaku sertifikat keamanan website. Jika kedaluwarsa, browser akan memblokir akses pengguna.</li>
                        </ul>
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--accent)' }}>Infrastructure (Infrastruktur):</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          <li><strong>Server:</strong> Perangkat lunak web server yang memproses website (misal: Nginx, Apache, IIS).</li>
                          <li><strong>Hosting Provider:</strong> Perusahaan penyedia server fisik tempat website diletakkan.</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. VISIT WEBSITE */}
                <div style={{ marginTop: 20 }}>
                  <a href={website.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      width: '100%', padding: '16px', background: 'var(--primary)', color: '#fff',
                      borderRadius: 12, fontSize: 16, fontWeight: 900, textDecoration: 'none',
                      boxShadow: '0 4px 12px var(--primary-glow)', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px var(--primary-glow)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px var(--primary-glow)' }}
                  >
                    🌐 VISIT WEBSITE ↗
                  </a>
                </div>
              </div>
            )
          })()}



          {/* ── PERFORMANCE ── */}
          {tab === 'performance' && (
            <div>
              {/* Performance mini cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Avg Response', value: fmt(avgRT), color: '#3b82f6' },
                  { label: 'Slowest', value: fmt(maxRT), color: '#ef4444' },
                  { label: 'Fastest', value: fmt(minRT), color: '#10b981' },
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
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                  { label: 'Successful Checks', value: upLogsCount },
                  { label: 'Sample Uptime', value: `${uptime}%` },
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
                  <tr>{['Time', 'Status', 'HTTP', 'Latency', 'Health', 'SSL'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      <td style={st.td}>{fmtTime(log.checked_at)}</td>
                      <td style={st.td}><span style={{ color: STATUS_COLORS[log.status] || '#4a5568', fontWeight: 600, fontSize: 10 }}>{log.status || '—'}</span></td>
                      <td style={st.td}>{log.status_code ?? '—'}</td>
                      <td style={st.td}>{fmt(log.response_time_ms)}</td>
                      <td style={st.td}><span style={{ color: log.health_score > 80 ? '#10b981' : '#f59e0b' }}>{log.health_score}%</span></td>
                      <td style={st.td}>{log.ssl_valid == null ? '—' : log.ssl_valid ? '✓' : '✗'}</td>
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
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
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

      {/* Lightbox Modal overlay for screenshot enlargement */}
      {isZoomed && screenshot && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out'
          }}
          onClick={() => setIsZoomed(false)}
        >
          <div 
            style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top controls row */}
            <div style={{
              position: 'absolute',
              top: 16,
              right: 16,
              display: 'flex',
              gap: 10,
              zIndex: 10001
            }}>
              <button
                onClick={handleCopyScreenshot}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: copied ? 'rgba(16, 185, 129, 0.9)' : 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Tersalin!' : 'Salin Gambar'}
              </button>
              <button
                onClick={() => setIsZoomed(false)}
                style={{
                  background: 'rgba(239, 68, 68, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                Tutup ✕
              </button>
            </div>
            
            <img 
              src={`data:image/png;base64,${screenshot}`}
              alt="Website screenshot zoom"
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                borderRadius: 8,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.15)',
                objectFit: 'contain',
                marginTop: 60
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(30,41,59,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' },
  modal: {
    width: 'min(800px, 95%)',
    height: 'min(720px, 85vh)',
    background: 'var(--bg-header)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
    overflow: 'hidden',
    animation: 'fadeIn 0.2s ease-out'
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  favicon: { width: 36, height: 36, background: 'var(--accent-light)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  initial: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#3b82f6' },
  websiteName: { fontSize: 16, fontWeight: 800, color: 'var(--text)' },
  websiteUrl: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  closeBtn: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
  tabs: { display: 'flex', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  tabBtn: { flex: 1, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', padding: '10px 4px', cursor: 'pointer', borderBottom: '2px solid transparent', transition: 'all 0.15s' },
  tabActive: { color: '#2563eb', borderBottom: '2px solid #2563eb', background: 'rgba(59,130,246,0.06)' },
  body: { flex: 1, overflowY: 'auto', padding: '16px 18px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 9, color: 'var(--text-sub)', letterSpacing: '0.1em', borderBottom: '1px solid var(--border)', fontWeight: 800, background: 'var(--bg-header)' },
  td: { padding: '7px 10px', color: 'var(--text-sub)', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' },
}
