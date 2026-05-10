import { useState, useEffect, useCallback, useMemo } from 'react'
import { websiteAPI, eventsAPI } from '../../services/api'
import { useGlobalWebSocket } from '../../store/WebSocketContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const STATUS_COLORS = { 
  ONLINE: '#10b981', 
  DEGRADED: '#8b5cf6', 
  WARNING: '#f59e0b', 
  CRITICAL: '#d97706', 
  OFFLINE: '#f43f5e',
  UNKNOWN: '#64748b'
}

const StatusBadge = ({ status }) => {
  const c = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    DEGRADED: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
    WARNING: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    CRITICAL: { bg: 'rgba(217,119,6,0.15)', color: '#d97706', border: 'rgba(217,119,6,0.3)' },
    OFFLINE: { bg: 'rgba(244,63,94,0.15)', color: '#f43f5e', border: 'rgba(244,63,94,0.3)' },
  }[status] || { bg: 'rgba(74,85,104,0.15)', color: '#4a5568', border: 'rgba(74,85,104,0.3)' }
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
      {status || 'PENDING'}
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

// ── Translation & Helpers ─────────────────────────────────────
const getHttpDesc = (code) => {
  if (!code) return 'Koneksi Terputus (Timeout/Refused)';
  if (code === 403) return 'Akses Ditolak (Locked). Server memblokir permintaan monitor.';
  if (code === 401) return 'Perlu Login (Unauthorized). Monitor tidak memiliki izin akses.';
  if (code === 404) return 'Halaman Tidak Ditemukan. Alamat URL salah atau sudah dihapus.';
  if (code >= 500) return 'Server Error. Aplikasi di server sedang mengalami gangguan internal.';
  if (code >= 400) return 'Masalah Akses. Ada kendala pada sisi permintaan ke server.';
  return `Sukses (HTTP ${code})`;
}

const getSslDesc = (valid) => {
  if (valid === true) return 'Aman & Terenkripsi (Sertifikat Valid)';
  if (valid === false) return 'Tidak Aman (Sertifikat Rusak/Kadaluarsa)';
  return 'Tidak Dicek / Non-HTTPS';
}

const getLatencyDesc = (ms) => {
  if (!ms) return 'Tidak Terdeteksi';
  if (ms < 500) return 'Sangat Cepat (Lancar)';
  if (ms < 1500) return 'Normal (Standar)';
  if (ms < 5000) return 'Lambat (Perlu Diperhatikan)';
  return 'Sangat Lambat (Berisiko Down)';
}

// ── Analisis Kondisi Section ────────────────────────────────────────

function AnalisisKondisi({ website }) {
  const [analyzing, setAnalyzing] = useState(true)
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    setAnalyzing(true)
    const timer = setTimeout(() => {
      const result = performAIAnalysis(website)
      setAnalysis(result)
      setAnalyzing(false)
    }, 1500)
    return () => clearTimeout(timer)
  }, [website.status, website.root_cause, website.url])

  const performAIAnalysis = (w) => {
    const rc = w.root_cause?.toUpperCase() || ''
    const status = w.status
    const code = w.status_code
    const sslValid = w.ssl_valid
    const rt = w.response_time_ms || 0

    if (status === 'OFFLINE' || rc.includes('DNS') || rc.includes('TIMEOUT')) {
      if (rc.includes('DNS')) {
        return {
          title: "GANGGUAN TOTAL: Alamat Tidak Ditemukan",
          icon: "📍", color: "#f43f5e",
          summary: "Kesalahan pada Buku Alamat (DNS)",
          explanation: "Sistem monitor tidak bisa menemukan 'alamat rumah' dari aplikasi ini. Hal ini biasanya terjadi karena nama domain sudah mati, salah ketik, atau ada gangguan di penyedia domain.",
          recommendation: "Periksa pengaturan DNS atau hubungi penyedia domain Anda."
        }
      }
      return {
        title: "GANGGUAN TOTAL: Koneksi Terputus",
        icon: "🔌", color: "#f43f5e",
        summary: "Server Tidak Menjawab",
        explanation: `Sistem mencoba menghubungi server selama ${rt}ms tapi tidak ada balasan. Ini seperti menelepon tapi tidak diangkat. Server mungkin sedang mati atau jaringan internet ke sana terputus.`,
        recommendation: "Pastikan server sedang menyala dan tidak ada firewall yang memblokir akses."
      }
    }

    if (sslValid === false) {
      return {
        title: "BERISIKO: Masalah Keamanan",
        icon: "🔒", color: "#f59e0b",
        summary: "Sertifikat Keamanan Bermasalah (SSL)",
        explanation: "Website ini menggunakan HTTPS tapi 'surat ijin'-nya (Sertifikat SSL) sudah kadaluarsa atau tidak cocok. Ini akan membuat browser memunculkan peringatan 'TIDAK AMAN' kepada pengguna.",
        recommendation: "Perbarui sertifikat SSL website Anda segera."
      }
    }

    if (code === 403 || code === 401) {
      return {
        title: "GANGGUAN AKSES: Pintu Terkunci",
        icon: "🚫", color: "#d97706",
        summary: "Akses Ditolak oleh Server",
        explanation: "Server website aktif dan sehat, namun dia sengaja menolak memberikan akses ke sistem monitor kami. Ini sering terjadi jika server memiliki sistem keamanan (WAF) yang sangat ketat.",
        recommendation: "Masukkan alamat IP monitor ke daftar putih (Whitelist) di server Anda."
      }
    }

    if (code >= 500) {
      return {
        title: "GANGGUAN APLIKASI: Server Error",
        icon: "💥", color: "#f43f5e",
        summary: "Aplikasi di Server Mengalami Crash",
        explanation: `Server membalas dengan kode kesalahan ${code}. Ini berarti koneksi internet aman, tapi aplikasi/website di dalam server tersebut gagal dijalankan karena ada error internal.`,
        recommendation: "Periksa log error aplikasi di dalam server untuk melihat bagian yang rusak."
      }
    }

    if (status === 'ONLINE') {
      return {
        title: "SISTEM SEHAT: Kondisi Optimal",
        icon: "✨", color: "#10b981",
        summary: "Aplikasi Berjalan Normal",
        explanation: `Semua parameter hijau. Aplikasi merespon dalam waktu ${rt}ms (${getLatencyDesc(rt)}), sertifikat keamanan valid, dan server memberikan akses penuh.`,
        recommendation: "Teruskan pemantauan rutin untuk menjaga stabilitas."
      }
    }

    return {
      title: "KONDISI TIDAK DIKETAHUI",
      icon: "❓", color: "#64748b",
      summary: "Menunggu Data Terkumpul",
      explanation: "Sistem belum memiliki cukup data untuk memberikan analisa narasi yang akurat.",
      recommendation: "Tunggu beberapa saat selagi sistem mengumpulkan data."
    }
  }

  if (analyzing) return (
    <div style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.05), rgba(99,102,241,0.05))', borderRadius: 12, padding: '24px', border: '1px dashed rgba(99,102,241,0.3)', textAlign: 'center', marginTop: 16 }}>
      <div className="system-thinking" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 800, letterSpacing: '0.05em' }}>
        <span style={{ marginRight: 10, display: 'inline-block', animation: 'spin 2s linear infinite' }}>🔍</span>
        MENGANALISA KONDISI SISTEM...
      </div>
    </div>
  )


  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <div style={{ width: 4, height: 18, background: analysis.color, borderRadius: 2, boxShadow: `0 0 8px ${analysis.color}` }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', letterSpacing: '0.05em' }}>RINGKASAN NARASI KONDISI</span>
        <div style={{ marginLeft: 'auto', background: `${analysis.color}22`, color: analysis.color, fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4, border: `1px solid ${analysis.color}44` }}>KECERDASAN SISTEM</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--bg-main)', border: `1px solid ${analysis.color}33`, borderRadius: 16, padding: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.02)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>{analysis.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: analysis.color }}>{analysis.title}</div>
              <div style={{ fontSize: 18, fontWeight: 1000, color: 'var(--text)' }}>{analysis.summary}</div>
            </div>
          </div>
          
          <div style={{ height: 1, background: 'var(--border)', margin: '15px 0' }} />
          
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.05em' }}>PENJELASAN KONDISI:</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: 15 }}>{analysis.explanation}</div>
          
          <div style={{ background: `${analysis.color}08`, border: `1px dashed ${analysis.color}44`, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: analysis.color, marginBottom: 4, letterSpacing: '0.05em' }}>💡 SARAN TINDAKAN:</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{analysis.recommendation}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Root Cause Section ────────────────────────────────────────

function RootCauseSection({ website }) {
  const rc = website.root_cause || (website.status === 'ONLINE' ? 'All checks passed' : 'Unknown')

  const CAUSES = {
    'DNS lookup failed': {
      color: '#ef4444',
      possible: ['DNS server unreachable', 'Domain name expired', 'Internal Intranet domain access'],
    },
    'Connection timeout': {
      color: '#f59e0b',
      possible: ['Server is overloaded', 'Firewall blocking traffic'],
    },
    'SSL validation failed': {
      color: '#f59e0b',
      possible: ['Expired certificate', 'Hostname mismatch', 'Self-signed certificate'],
    },
    'Too many redirects': {
      color: '#ef4444',
      possible: ['Endless SSO Auth loop', 'Invalid Landing Page URL', 'Broken routing logic'],
    }
  }

  const info = CAUSES[rc] || { color: '#f59e0b', possible: ['Manual investigation required'] }

  return (
    <div style={{ marginTop: 12, padding: '10px 14px', background: info.color + '08', border: `1px solid ${info.color}22`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{rc === 'All checks passed' ? '✓' : '⚠'} {rc}</div>
      </div>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────

export default function ServiceDetailModal({ website, onClose }) {
  const [tab, setTab] = useState('overview')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

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

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // WebSocket Sync for Logs
  useGlobalWebSocket(useCallback((msg) => {
    if ((msg.type === 'monitor_update' || msg.type === 'status_change') && msg.payload.website_id === website?.id) {
      fetchLogs(true) // Silent update
    }
  }, [website?.id, fetchLogs]))

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

  const TABS = ['OVERVIEW', 'PERFORMANCE', 'TIMELINE', 'HISTORY', 'ALERTS']

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
          {tab === 'overview' && (
            <div>
              <AnalisisKondisi website={website} />

              <div style={{ marginTop: 24, padding: '20px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 15, fontWeight: 900, letterSpacing: '0.05em' }}>DETAIL PARAMETER TEKNIS</div>
                <InfoRow label="Status Saat Ini" value={<StatusBadge status={website.status} />} />
                <InfoRow label="Kode Respon" value={getHttpDesc(website.status_code)} valueColor={!website.status_code ? '#ef4444' : undefined} />
                <InfoRow label="Keamanan (SSL)" value={getSslDesc(website.ssl_valid)} valueColor={website.ssl_valid ? '#10b981' : (website.ssl_valid === false ? '#ef4444' : undefined)} />
                <InfoRow label="Kecepatan Respon" value={`${fmt(website.response_time_ms)} — ${getLatencyDesc(website.response_time_ms)}`} />
                <InfoRow label="Kesehatan Website" value={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${website.health_score || 0}%`, height: '100%', background: website.health_score > 80 ? '#10b981' : website.health_score > 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span style={{ color: website.health_score > 80 ? '#10b981' : website.health_score > 50 ? '#f59e0b' : '#ef4444' }}>{website.health_score || 0}%</span>
                  </div>
                } />
                <InfoRow label="Alamat IP" value={website.ip_address || '—'} />
                <InfoRow label="Pengecekan Terakhir" value={fmtTime(website.last_checked)} />
              </div>
              
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
          )}

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
                  { label: 'Alert Events', value: alerts.length },
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
