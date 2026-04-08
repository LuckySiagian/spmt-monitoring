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
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{label}</span>
    <span style={{ fontSize: 11, fontWeight: 700, color: valueColor || 'var(--text)', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
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

// ── AI Analyst Section ────────────────────────────────────────

function AIAnalyst({ website }) {
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
    const rc = w.root_cause?.toLowerCase() || ''
    const status = w.status
    const isHTTPS = w.url?.startsWith('https')
    const sslValid = w.ssl_valid

    // Skenario 1: Redirect Loop
    if (rc.includes('redirect')) {
      return {
        title: "Redirect Loop Detected / Terdeteksi Pengalihan Berulang",
        severity: "OFFLINE / INVESTIGATION REQUIRED",
        summary: "EN: The monitoring agent is caught in an infinite redirect loop.\nID: Sistem monitoring terjebak dalam pengalihan halaman yang berulang-ulang.",
        explanation: "EN: This usually occurs on corporate portals (SSO) where the agent is repeatedly forced to a login page. Browsers handle this via session cookies, but a probe-based monitor sees it as an unstable path.\nID: Ini biasanya terjadi di portal kantor (SSO). Browser biasa punya 'cookie', tapi sistem monitor kami melihatnya sebagai koneksi yang tidak stabil.",
        recommendation: "EN: Use a direct URL or whitelist the monitoring server's User-Agent on the SSO gateway.\nID: Gunakan URL langsung atau daftarkan (whitelist) IP monitor ini di sistem keamanan portal."
      }
    }

    // Skenario 2: SSL Invalid
    if (!sslValid && isHTTPS) {
      return {
        title: "Security Certificate Mismatch / Sertifikat Tidak Valid",
        severity: "CRITICAL (Unsecured Service)",
        summary: "EN: Service is reachable but SSL certificate validation failed.\nID: Website bisa dibuka namun sertifikat keamanan (gembok) bermasalah.",
        explanation: "EN: The NOC system enforces strict TLS protocols. While browsers allow a manual bypass, this monitoring agent blocks the request to flag potential security risks or expired certs.\nID: Sistem NOC menjaga standar keamanan tinggi. Browser mungkin membolehkan akses manual, tapi monitor ini wajib memberi peringatan jika sertifikat kadaluwarsa.",
        recommendation: "EN: Renew the SSL certificate or fix the intermediate certificate chain on the server.\nID: Segera perbaharui sertifikat SSL atau perbaiki susunan sertifikat di server."
      }
    }

    // Skenario 3: DNS issues
    if (rc.includes('dns') || rc.includes('no such host')) {
      return {
        title: "DNS Resolution Failure / Nama Domain Tidak Ditemukan",
        severity: "OFFLINE (Unreachable)",
        summary: "EN: System could not find the IP address for this domain.\nID: Sistem tidak bisa menemukan alamat IP untuk domain ini.",
        explanation: "EN: This suggests an internal domain that is only reachable via corporate VPN or Intranet. The monitoring host might be outside this network boundary.\nID: Ini menunjukkan domain internal yang hanya bisa dibuka via VPN atau Intranet kantor. Server monitor mungkin berada di luar jaringan tersebut.",
        recommendation: "EN: Verify DNS settings or ensure the monitoring host can reach the internal DNS server.\nID: Cek pengaturan DNS atau pastikan server monitor sudah terhubung ke jaringan internal."
      }
    }

    // Default Online
    if (status === 'ONLINE') {
      return {
        title: "Service Health Optimal / Kondisi Sistem Normal",
        severity: "HEALTHY (Stable)",
        summary: "EN: All monitoring probes returned successful status codes.\nID: Semua pengecekan berjalan lancar dan memberikan respon sukses.",
        explanation: "EN: Connectivity, SSL validity, and performance are within the high-standard operational range.\nID: Konektivitas, validitas SSL, dan kecepatan respon berada dalam batas normal yang stabil.",
        recommendation: "EN: No action required. Service is operating as expected.\nID: Tidak perlu tindakan. Website beroperasi sesuai harapan."
      }
    }

    // Fallback
    return {
      title: "Service Disruption / Gangguan Layanan",
      severity: "STATUS: " + status,
      summary: "EN: Automated check failed to establish a stable connection.\nID: Sistem gagal menjalin koneksi yang stabil dengan website.",
      explanation: "EN: The connection was dropped by the server or blocked by a firewall. This often happens if the monitoring probe is detected as a robot/threat.\nID: Koneksi diputus oleh server atau diblokir firewall (dinding api). Sering terjadi jika monitor dideteksi sebagai bot/ancaman.",
      recommendation: "EN: Check server firewall logs and allow traffic from the monitoring server IP.\nID: Cek log keamanan server dan izinkan akses (whitelist) untuk IP server monitor ini."
    }
  }

  if (analyzing) return (
    <div style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.05), rgba(99,102,241,0.05))', borderRadius: 12, padding: '24px', border: '1px dashed rgba(99,102,241,0.3)', textAlign: 'center', marginTop: 16 }}>
      <div className="ai-thinking" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 800, letterSpacing: '0.05em' }}>
        <span style={{ marginRight: 10, display: 'inline-block', animation: 'spin 2s linear infinite' }}>🧠</span>
        AI AGENT ANALYZING... / MENGANALISA...
      </div>
    </div>
  )

  const theme = {
    'ONLINE': { color: '#10b981', bg: 'rgba(16,185,129,0.05)', icon: '✅' },
    'OFFLINE': { color: '#ef4444', bg: 'rgba(239,68,68,0.05)', icon: '❌' },
    'CRITICAL': { color: '#f59e0b', bg: 'rgba(245,158,11,0.05)', icon: '⚠️' },
  }[analysis.severity.split(' ')[0]] || { color: '#3b82f6', bg: 'rgba(59,130,246,0.05)', icon: '🤖' }

  return (
    <div style={{ marginTop: 20, background: 'var(--bg-card)', border: `2px solid ${theme.color}33`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
      <div style={{ background: theme.color, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '0.03em' }}>AI AGENT NOC DIAGNOSIS</span>
        <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', padding: '2px 10px', borderRadius: 20, color: '#fff', fontSize: 10, fontWeight: 800 }}>BILINGUAL ANALYST</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
            {theme.icon}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>{analysis.title}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: theme.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{analysis.severity}</div>
          </div>
        </div>

        {/* BILINQUAL SUMMARY */}
        <div style={{ background: 'rgba(0,0,0,0.02)', padding: '14px 16px', borderRadius: 10, borderLeft: `5px solid ${theme.color}`, marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, opacity: 0.7 }}>SUMMARY / RINGKASAN</div>
          {analysis.summary.split('\n').map((ln, i) => (
            <div key={i} style={{ fontSize: i === 0 ? 13 : 12, color: i === 0 ? 'var(--text)' : 'var(--text-sub)', fontWeight: i === 0 ? 700 : 500, fontStyle: i === 1 ? 'italic' : 'normal', marginBottom: i === 0 ? 4 : 0 }}>{ln}</div>
          ))}
        </div>

        {/* BILINQUAL EXPLANATION */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#4a6fa5', marginBottom: 8, letterSpacing: '0.05em', opacity: 0.7 }}>ANALYSIS / ANALISA</div>
          <div style={{ background: 'rgba(99,102,241,0.03)', padding: '14px', borderRadius: 8 }}>
            {analysis.explanation.split('\n').map((ln, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-sub)', marginBottom: i === 0 ? 10 : 0, fontWeight: i === 0 ? 500 : 400, fontStyle: i === 1 ? 'italic' : 'normal' }}>{ln}</div>
            ))}
          </div>
        </div>

        {/* BILINQUAL RECOMMENDATION */}
        <div style={{ padding: '16px', background: `${theme.color}11`, borderRadius: 12, border: `1px solid ${theme.color}22` }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: theme.color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💡</span> AI RECOMMENDATION / SARAN AI:
          </div>
          {analysis.recommendation.split('\n').map((ln, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.5, color: i === 0 ? 'var(--text)' : 'var(--text-sub)', fontWeight: i === 0 ? 800 : 600, marginBottom: i === 0 ? 4 : 0 }}>{ln}</div>
          ))}
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
  const avgRT = rtSeries.length ? Math.round(rtSeries.reduce((a, b) => a + b, 0) / rtSeries.length) : null
  const maxRT = rtSeries.length ? Math.max(...rtSeries) : null
  const minRT = rtSeries.length ? Math.min(...rtSeries) : null
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
              <InfoRow label="Service Name" value={website.name} />
              <InfoRow label="URL" value={website.url} />
              <InfoRow label="IP Address" value={website.ip_address || '—'} />
              <InfoRow label="Status" value={<StatusBadge status={website.status} />} />
              <InfoRow label="HTTP Code" value={website.status_code} />
              <InfoRow label="DNS Status" value={website.dns_resolved === false ? '✗ Failed' : '✓ Resolved'} valueColor={website.dns_resolved === false ? '#ef4444' : '#10b981'} />
              <InfoRow label="SSL Status" value={website.ssl_valid == null ? '—' : website.ssl_valid ? '✓ Valid' : '✗ Invalid'} valueColor={website.ssl_valid ? '#10b981' : '#ef4444'} />
              <InfoRow label="Response Time" value={fmt(website.response_time_ms)} valueColor={website.response_time_ms > 3000 ? '#f59e0b' : '#10b981'} />
              <InfoRow label="Monitoring Interval" value={website.interval_seconds ? `${website.interval_seconds}s` : '—'} />
              <InfoRow label="Last Check" value={fmtTime(website.last_checked)} />
              <InfoRow label="24h Sample Uptime" value={`${uptime}%`} valueColor={parseFloat(uptime) > 99 ? '#10b981' : parseFloat(uptime) > 90 ? '#f59e0b' : '#ef4444'} />

              <RootCauseSection website={website} />
              <AIAnalyst website={website} />
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
                  { label: 'Successful Checks', value: upLogs.length },
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
                  <tr>{['Time', 'Status', 'HTTP', 'Response', 'SSL', 'DNS'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
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
  modal: { width: 'min(700px, 95%)', maxHeight: '90vh', background: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' },
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
