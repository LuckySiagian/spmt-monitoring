import { useState, useEffect, useCallback, useMemo } from 'react'
import { websiteAPI, eventsAPI, systemAPI } from '../../services/api'
import { useGlobalWebSocket } from '../../store/WebSocketContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const STATUS_COLORS = { 
  ONLINE: '#10b981', 
  WARNING: '#f59e0b', 
  DEGRADED: '#f97316', 
  CRITICAL: '#ef4444', 
  OFFLINE: '#dc2626',
  UNKNOWN: '#64748b'
}

let cachedSysHealth = null

const StatusBadge = ({ status }) => {
  const c = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    WARNING: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    DEGRADED: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'rgba(249,115,22,0.3)' },
    CRITICAL: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    OFFLINE: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626', border: 'rgba(220,38,38,0.3)' },
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
const getStatusEmojiAndText = (status) => {
  if (status === 'ONLINE') return '🟢 ONLINE'
  if (status === 'WARNING') return '🟡 ONLINE'
  if (status === 'DEGRADED') return '🟠 ONLINE'
  if (status === 'CRITICAL') return '🔴 ONLINE'
  if (status === 'OFFLINE') return '🔴 OFFLINE'
  return '⚪ UNKNOWN'
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

const getServerLoadText = (health) => {
  if (!health) return 'Loading...'
  const cpu = Math.round(health.backend_cpu || 0)
  const ram = Math.round(health.backend_ram || 0)
  let status = 'Sehat'
  if (cpu > 80 || ram > 85) status = 'Kritis'
  else if (cpu > 60 || ram > 70) status = 'Tinggi'
  return `CPU: ${cpu}% | RAM: ${ram}% (${status})`
}

// ── Analisis Kondisi Section ────────────────────────────────────────

function AnalisisKondisi({ website, sysHealth }) {
  const [analyzing, setAnalyzing] = useState(true)
  const [analysis, setAnalysis] = useState(null)

  const performAIAnalysis = (w, health) => {
    const rc = w.root_cause?.toUpperCase() || ''
    const status = w.status
    const code = w.status_code
    const sslValid = w.ssl_valid
    const rt = w.response_time_ms || 0
    const dnsResolved = w.dns_resolved
    const ip = w.ip_address || ''

    const isBlockIP = ['36.86.63.185', '182.23.79.195', '139.255.196.196', '103.111.196.196', '103.111.196.197', '118.98.96.104'].includes(ip)
    const isISPBlock = isBlockIP || rc.includes('BLOKIR') || rc.includes('POSITIF') || rc.includes('ISP') || rc.includes('ADUAN') || rc.includes('SENSOR')

    // Extract health info
    const cpu = health ? Math.round(health.backend_cpu || 0) : 0
    const ram = health ? Math.round(health.backend_ram || 0) : 0
    const isNodeCritical = cpu > 80 || ram > 85

    // 0. ISP Block Check First (Highest Priority)
    if (isISPBlock) {
      return {
        title: "AKSES DIBLOKIR (ISP FILTER)",
        icon: "🚫", color: "#f59e0b",
        summary: "Websitenya kena blokir sensor internet, Bos!",
        explanation: `Websitenya sebenarnya aktif dan bisa dibuka (seperti yang Anda lihat di HP/Browser jika Anda pakai Secure DNS / DoH / VPN), tapi jaringan internet di server pemantau kami terblokir oleh kebijakan penapisan konten ISP lokal (IP terarah ke ${ip || 'halaman blokir'}).`,
        recommendation: "Ini bukan karena websitenya mati. Jika ini server Anda, pastikan DNS server monitor menggunakan DNS alternatif atau VPN."
      }
    }

    if (!dnsResolved) {
      return {
        title: "DOMAIN TIDAK DITEMUKAN",
        icon: "📍", color: "#ef4444",
        summary: "Koneksi gagal karena nama domain tidak terurai (DNS Error).",
        explanation: "Sistem tidak berhasil menerjemahkan nama domain menjadi alamat IP sehingga koneksi ke website tidak dapat dilakukan.\n\nKemungkinan penyebab:\n• Nama domain salah ketik atau tidak valid\n• Domain tidak aktif / expired\n• Gangguan DNS atau nameserver\n• Domain belum terpropagasi dengan benar\n\nCatatan:\nKarena DNS gagal, pemeriksaan SSL dan HTTP tidak dapat dilanjutkan.",
        recommendation: "Periksa kembali penulisan nama domain (pastikan tidak ada typo), cek masa aktif domain, dan konfigurasi DNS Anda."
      }
    }

    // 1. OFFLINE Status
    if (status === 'OFFLINE') {
      return {
        title: "KONEKSI PUTUS TOTAL (OFFLINE)",
        icon: "💀", color: "#ef4444",
        summary: "Websitenya mati total, Bos!",
        explanation: "Tidak ada rute yang berhasil dijangkau dan koneksi terputus total. Server target kemungkinan besar mati dari jaringan (Down).",
        recommendation: "Pastikan fisik servernya menyala dan jaringan di lokasi tujuan tidak mengalami gangguan massal."
      }
    }

    // 2. CRITICAL Status
    if (status === 'CRITICAL') {

      if (code >= 500) {
        return {
          title: "SERVER ERROR",
          icon: "💥", color: "#ef4444",
          summary: "Server websitenya lagi rusak/crash, Bos!",
          explanation: `Server ngebalas dengan kode error ${code}. Jaringan ke sana aman, tapi aplikasi di dalam servernya lagi error atau mati total.`,
          recommendation: "Coba hubungi developer webnya buat meriksa log error di server."
        }
      }

      if (code === 403 || code === 401) {
        return {
          title: "AKSES DITOLAK",
          icon: "🔒", color: "#ef4444",
          summary: "Pintu masuk websitenya dikunci, Bos!",
          explanation: `Servernya nyala tapi nolak ngasih akses ke sistem monitor kita (Kode ${code}). Mungkin karena diproteksi sistem keamanan ketat.`,
          recommendation: "Minta admin web buat masukin IP server monitor kita ke whitelist/daftar aman."
        }
      }

      const isSocialMedia = /tiktok\.com|reddit\.com|facebook\.com|instagram\.com|youtube\.com|twitter\.com|x\.com|pinterest\.com|tumblr\.com|linkedin\.com|netflix\.com|spotify\.com|twitch\.tv|steamcommunity\.com/.test(w.url?.toLowerCase())
      if (isSocialMedia && !code) {
        return {
          title: "AKSES TERBATAS (FIREWALL)",
          icon: "🛡", color: "#f59e0b",
          summary: "Akses diblokir jaringan kantor, Bos!",
          explanation: `Sistem monitor mendeteksi RTO (Koneksi Ditolak) saat menghubungi server ${w.name || 'sosial media'}. Sebagai platform global yang sangat besar, server target hampir pasti aktif normal. Kemungkinan besar koneksi ke platform ini diblokir atau dibatasi oleh sistem firewall/kebijakan keamanan jaringan kantor tempat Anda berada.`,
          recommendation: "Coba akses menggunakan data seluler di HP Anda (tanpa WiFi kantor). Jika di HP lancar, berarti firewall kantor Anda yang membatasi aksesnya."
        }
      }

      if (!code && (rc.includes('RTO') || rc.includes('Time Out') || rc.includes('timeout') || rc.includes('ditolak') || rc.includes('refused') || rc.includes('diblokir') || rt > 12000 || rt === 0)) {
        return {
          title: "KONEKSI HTTPS TIDAK BERHASIL DIVERIFIKASI",
          icon: "🔌", color: "#ef4444",
          summary: "Alamat IP ditemukan, tapi request HTTPS ditolak atau timeout.",
          explanation: "Sistem berhasil menemukan alamat IP target, namun proses koneksi HTTPS tidak selesai sehingga status SSL dan HTTP tidak dapat dipastikan.\n\nKemungkinan penyebab:\n• Timeout koneksi dari node monitoring\n• Firewall/proxy jaringan membatasi request tertentu\n• Gangguan TLS/HTTPS sementara\n• Pembatasan akses terhadap automated monitoring\n• Resource node monitoring sedang tinggi\n\nCatatan:\nWebsite target belum tentu benar-benar offline karena DNS masih aktif dan akses dapat berbeda tergantung jaringan pengguna.",
          recommendation: "Coba akses secara manual di perangkat/jaringan berbeda. Jika web bisa dibuka, kemungkinan server target menolak automated monitoring atau firewall corporate menahan koneksi."
        }
      }

      // 2a. Private Key Missing (Error #4 dari referensi)
      if (rc.includes('PRIVATE_KEY')) {
        return {
          title: "PRIVATE KEY MISSING",
          icon: "🔑", color: "#ef4444",
          summary: "Kunci privat SSL tidak ditemukan di server!",
          explanation: "Sertifikat SSL yang diinstal tidak memiliki pasangan Private Key yang cocok di web server. Akibatnya, website tidak bisa memuat HTTPS sama sekali.",
          recommendation: "Lakukan pengajuan ulang (re-issue) sertifikat SSL dengan membuat CSR baru dan Private Key baru di server yang sama."
        }
      }

      // 2b. ERR_SSL_PROTOCOL_ERROR (Error #5 dari referensi)
      if (rc.includes('PROTOCOL_ERROR')) {
        return {
          title: "ERR_SSL_PROTOCOL_ERROR",
          icon: "🚫", color: "#ef4444",
          summary: "Browser gagal memverifikasi protokol keamanan!",
          explanation: "Ada kesalahan pada protokol SSL yang bikin browser gagal memverifikasi koneksi aman. Bisa karena cache corrupt, firewall memblokir, atau sertifikat benar-benar rusak.",
          recommendation: "1. Bersihkan cache & cookies browser. 2. Nonaktifkan antivirus/firewall sementara. 3. Update browser ke versi terbaru."
        }
      }

      if (code === 404) {
        return {
          title: "HALAMAN TIDAK DITEMUKAN",
          icon: "🔎", color: "#ef4444",
          summary: "Halamannya gak ada, Bos! (404)",
          explanation: `Server websitenya nyala, tapi dia bilang halaman yang kamu cari (${w.url}) itu gak terdaftar atau udah dihapus.`,
          recommendation: "Cek lagi pengetikan alamatnya. Bisa jadi ada typo atau link-nya udah basi."
        }
      }

      if (rt > 10000) {
        return {
          title: "LEMOT PARAH",
          icon: "⏳", color: "#ef4444",
          summary: "Respon website lambat banget (>10 detik), Bos!",
          explanation: `Websitenya masih hidup, tapi loadingnya minta ampun lamanya (${(rt/1000).toFixed(1)} detik). Pengunjung bakal ngira websitenya rusak atau mati.`,
          recommendation: "Cek beban resource server target, barangkali database-nya lagi overload."
        }
      }

      if (sslValid === false) {
        // Deteksi jika masalahnya adalah salah nama domain (Hostname Mismatch)
        if (rc.includes('MISMATCH') || rc.includes('COCOK')) {
          return {
            title: "ALAMAT MUNGKIN SALAH",
            icon: "🧐", color: "#ef4444",
            summary: "Alamat web atau sertifikat gak cocok, Bos!",
            explanation: `Sistem monitor dapet respon, tapi sertifikat keamanannya nggak cocok buat nama domain '${w.name}'. Ini sering terjadi kalau ada salah ketik alamat (kayak hasil eksperimen kamu) atau servernya belum dikonfigurasi bener buat domain ini.`,
            recommendation: "Coba cek lagi penulisan alamat websitenya, pastikan nggak ada huruf yang kelebihan atau kurang (typo)."
          }
        }

        return {
          title: "SSL TIDAK VALID",
          icon: "🔒", color: "#ef4444",
          summary: "Sertifikat keamanan (SSL) rusak, Bos!",
          explanation: "Websitenya masih bisa dibuka, tapi browser bakal nampilin peringatan merah 'Koneksi Tidak Aman'. Ini biasanya karena sertifikatnya sudah expired.",
          recommendation: "Segera perbarui atau pasang ulang sertifikat SSL/HTTPS websitenya."
        }
      }

      if (isNodeCritical) {
        return {
          title: "BEBAN MONITOR KRITIS",
          icon: "💻", color: "#ef4444",
          summary: "Server pemantau kita lagi megap-megap, Bos!",
          explanation: `Websitenya sih aman, tapi RAM/CPU dari server monitor kita udah di atas batas wajar (RAM: ${ram}%, CPU: ${cpu}%). Ini bisa bikin hasil pantauan telat.`,
          recommendation: "Bisa coba restart service monitor atau tambah kapasitas RAM/CPU server kita."
        }
      }

      return {
        title: "KONDISI KRITIS",
        icon: "⚠", color: "#ef4444",
        summary: "Ada masalah kritis pada performa website, Bos!",
        explanation: "Websitenya masih online, tapi ada beberapa parameter penting (seperti kecepatan atau resource) yang kondisinya lagi gak sehat.",
        recommendation: "Periksa detail parameter teknis di atas untuk mencari tahu penyebab pastinya."
      }
    }

    // 3. WARNING / DEGRADED Status (🟡 or 🟠 ONLINE)
    // 3. WARNING / DEGRADED Status (🟡 or 🟠 ONLINE)
    if (status === 'WARNING' || status === 'DEGRADED') {
      const isProxy = rc.includes('PROKSI') || rc.includes('PROXY') || rc.includes('INTERSEPSI') || rc.includes('UNTRUSTED') || rc.includes('DIINTERSEPSI') || rc.includes('DIINTIP')
      
      // 3a. Kasus Mixed Content (Error #2 dari referensi)
      if (rc.includes('MIXED CONTENT')) {
        return {
          title: "MIXED CONTENT DETECTED",
          icon: "⚠️", color: "#f59e0b",
          summary: "Website tidak sepenuhnya aman (Mixed Content)!",
          explanation: "Website sudah pakai HTTPS, tapi ada gambar, skrip, atau stylesheet yang masih dimuat pakai HTTP biasa. Ini bikin ikon gembok di browser nggak muncul atau ada peringatan.",
          recommendation: "Gunakan plugin 'Really Simple SSL' (jika pakai WordPress) atau ganti semua link 'http://' di kode website kamu menjadi 'https://' secara manual."
        }
      }

      // 3b. Kasus Redirect Loop (Error #3 dari referensi)
      if (rc.includes('REDIRECTS') || rc.includes('REDIRECT_LOOP')) {
        return {
          title: "TOO MANY REDIRECTS",
          icon: "🔄", color: "#f59e0b",
          summary: "Website terjebak perulangan pengalihan!",
          explanation: "Ada kesalahan pengaturan URL atau konflik plugin yang bikin browser bolak-balik dialihkan (looping). Biasanya terjadi karena pengaturan HTTPS yang tabrakan.",
          recommendation: "Pastikan alamat WordPress dan Website sudah menggunakan protokol HTTPS semua. Coba nonaktifkan plugin keamanan atau redirect satu per satu untuk mencari penyebabnya."
        }
      }

      if (sslValid === false) {
        if (isProxy) {
          return {
            title: "KONEKSI DIPANTAU (JARINGAN KANTOR)",
            icon: "🛡️", color: "#f59e0b",
            summary: "Jaringan kantor lagi 'memantau' akses ini, Bos!",
            explanation: `Websitenya secara sistem aktif normal, tapi sistem keamanan kantor kamu (Firewall/Proxy) berada di tengah koneksi untuk memonitor traffic. Itulah alasan muncul peringatan 'Koneksi Tidak Privat' di browser. Kamu tetap bisa buka webnya, tapi keamanannya melewati filter kantor dulu.`,
            recommendation: "Gak usah panik, ini kebijakan umum di jaringan kantor. Kalau mau akses yang bener-bener bebas pantauan, pakailah internet pribadi."
          }
        }

        // NET::ERR_CERT_INVALID (Error #1 dari referensi)
        return {
          title: "NET::ERR_CERT_INVALID",
          icon: "🔒", color: "#f59e0b",
          summary: "Browser tidak bisa memverifikasi sertifikat SSL!",
          explanation: "Ini bisa disebabkan oleh 3 hal: Sertifikat expired, nama domain tidak sesuai, atau otoritas penerbit sertifikat tidak diakui oleh browser.",
          recommendation: "1. Cek masa berlaku SSL (Let's Encrypt hanya 90 hari). 2. Pastikan domain sudah sesuai. 3. Cek pengaturan waktu/tanggal di perangkat kamu."
        }
      }

      if (rt > 5000) {
        return {
          title: "KONEKSI LAMBAT",
          icon: "🐢", color: "#f59e0b",
          summary: "Websitenya agak lemot nih, Bos!",
          explanation: `Butuh waktu sekitar ${(rt/1000).toFixed(1)} detik buat ngerespon. Pengunjung mungkin bakal ngerasa loadingnya agak tersendat.`,
          recommendation: "Optimalkan server atau kurangi beban file yang berat di halaman utama."
        }
      }

      if (isNodeCritical) {
        return {
          title: "BEBAN MONITOR TINGGI",
          icon: "💻", color: "#f59e0b",
          summary: "Server pemantau kita lagi sibuk banget, Bos!",
          explanation: `Websitenya lancar, cuma RAM server monitor kita (${ram}%) udah mau penuh. Untungnya sejauh ini pemantauan masih berjalan.`,
          recommendation: "Pantau terus server monitor, lakukan pembersihan RAM jika diperlukan."
        }
      }

      return {
        title: "KONDISI KURANG OPTIMAL",
        icon: "⚡", color: "#f59e0b",
        summary: "Websitenya online, tapi ada sedikit kendala, Bos!",
        explanation: "Secara umum bisa diakses, cuma ada beberapa indikator performa atau keamanan yang nilainya kurang dari standar normal.",
        recommendation: "Coba cek bagian parameter yang berwarna kuning atau jingga ya."
      }
    }

    // 4. ONLINE Status (🟢 ONLINE)
    if (status === 'ONLINE') {
      // 4a. Anti-Flapping validation in progress
      if (rc.includes('MEMVALIDASI') || rc.includes('FLAPPING')) {
        return {
          title: "VALIDASI KESTABILAN JARINGAN",
          icon: "🔄", color: "#f59e0b",
          summary: "Sedang menguji kestabilan koneksi, Bos!",
          explanation: "Sistem mendeteksi adanya kegagalan koneksi/respon (seperti RTO atau kegagalan SSL). Untuk menghindari alarm palsu (flapping), sistem monitor sementara menahan status dan melakukan verifikasi ulang apakah gangguan ini bersifat permanen.",
          recommendation: "Tunggu pengecekan berikutnya (sekitar 1 menit) untuk melihat apakah status berubah menjadi OFFLINE atau kembali ONLINE normal."
        }
      }

      // 4b. Falsy/Zero HTTP code or extremely slow response (e.g. timeout / RTO)
      if (!code || rt > 12000) {
        return {
          title: "KONEKSI KURANG STABIL",
          icon: "⏳", color: "#f59e0b",
          summary: "Respon website lambat atau terputus, Bos!",
          explanation: `Sistem mendeteksi waktu respon yang sangat lambat (${rt ? (rt/1000).toFixed(1) + ' detik' : 'Timeout'}) atau kegagalan respon HTTP. Kemungkinan rute jaringan lokal Anda sedang lambat atau server target sedang sibuk.`,
          recommendation: "Coba akses secara manual di browser Anda untuk memastikan respon website saat ini."
        }
      }

      // 4c. SSL warning check
      if (sslValid === false) {
        const isProxy = rc.includes('PROKSI') || rc.includes('PROXY') || rc.includes('INTERSEPSI') || rc.includes('UNTRUSTED') || rc.includes('DIINTERSEPSI') || rc.includes('DIINTIP')
        
        if (isProxy) {
          return {
            title: "AKSES TERFILTER (KANTOR)",
            icon: "🛡️", color: "#f59e0b",
            summary: "Akses web ini melewati filter harian, Bos!",
            explanation: `Websitenya sehat walafiat, cuma sistem monitor kami mendeteksi adanya 'perantara' (Proxy/Firewall) dari jaringan kantor kamu yang ikut campur di koneksi SSL. Browser mungkin menganggap ini bahaya, padahal itu cuma sistem keamanan kantor yang lagi bekerja.`,
            recommendation: "Gunakan koneksi pribadi jika butuh privasi maksimal saat membuka website ini."
          }
        }

        return {
          title: "SISTEM SEHAT (SSL PERINGATAN)",
          icon: "⚠", color: "#f59e0b",
          summary: "Websitenya online, tapi SSL bermasalah, Bos!",
          explanation: `Websitenya online normal dan responsnya cepat (${rt}ms) serta DNS terhubung baik, namun sertifikat SSL-nya terdeteksi tidak valid atau tidak terpercaya.`,
          recommendation: "Segera periksa konfigurasi SSL target agar pengguna tidak mendapati peringatan keamanan di browser."
        }
      }

      // 4d. Server monitor high load (lowest priority)
      if (isNodeCritical) {
        return {
          title: "BEBAN MONITOR TINGGI",
          icon: "💻", color: "#f59e0b",
          summary: "Websitenya lancar, tapi server monitor lelah, Bos!",
          explanation: `Websitenya sih sehat walafiat dan bisa diakses cepat (${rt}ms), cuma server pemantau kita (Node Monitor) bebannya lagi tinggi banget (RAM: ${ram}%, CPU: ${cpu}%).`,
          recommendation: "Tenang, websitenya aman kok. Cuma server pemantau kita aja yang perlu dicek biar gak nge-hang."
        }
      }

      return {
        title: "SISTEM SEHAT",
        icon: "✨", color: "#10b981",
        summary: "Semua lancar aman, Bos!",
        explanation: `Websitenya online normal, responsnya super cepet (${rt}ms), alamat DNS-nya terhubung baik, dan sertifikat SSL-nya aktif aman. Gak ada masalah sama sekali!`,
        recommendation: "Semuanya mantap! Tetap pertahankan performa terbaiknya ya."
      }
    }

    // Fallback
    return {
      title: "MENUNGGU DATA",
      icon: "🔍", color: "#64748b",
      summary: "Lagi ngumpulin data pantauan, Bos!",
      explanation: "Sistem belum dapet cukup data buat ngasih analisa kondisi yang pas saat ini.",
      recommendation: "Tunggu beberapa detik lagi ya, nanti analisanya bakal muncul otomatis."
    }
  }

  useEffect(() => {
    setAnalyzing(true)
    const timer = setTimeout(() => {
      const result = performAIAnalysis(website, sysHealth)
      setAnalysis(result)
      setAnalyzing(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [website.id, website.status, website.root_cause])

  useEffect(() => {
    if (!analyzing) {
      const result = performAIAnalysis(website, sysHealth)
      setAnalysis(result)
    }
  }, [sysHealth, website, analyzing])

  if (analyzing) return (
    <div style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.05), rgba(99,102,241,0.05))', borderRadius: 12, padding: '24px', border: '1px dashed rgba(99,102,241,0.3)', textAlign: 'center', marginTop: 16 }}>
      <div className="system-thinking" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 800, letterSpacing: '0.05em' }}>
        <span style={{ marginRight: 10, display: 'inline-block', animation: 'spin 2s linear infinite' }}>🔍</span>
        MENGANALISA KONDISI SISTEM...
      </div>
    </div>
  )

  if (!analysis) return null

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
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: 15, whiteSpace: 'pre-line' }}>{analysis.explanation}</div>
          
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
  const [sysHealth, setSysHealth] = useState(cachedSysHealth)

  useEffect(() => {
    let active = true
    const fetchSysHealth = async () => {
      try {
        const res = await systemAPI.getHealth()
        if (res.data && active) {
          setSysHealth(res.data)
          cachedSysHealth = res.data
        }
      } catch (err) {
        console.error("Failed to fetch system health:", err)
      }
    }
    fetchSysHealth()
    const timer = setInterval(fetchSysHealth, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

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

  // WebSocket Sync for Logs and System Health
  useGlobalWebSocket(useCallback((msg) => {
    if ((msg.type === 'monitor_update' || msg.type === 'status_change') && msg.payload.website_id === website?.id) {
      fetchLogs(true) // Silent update
    } else if (msg.type === 'system_health') {
      setSysHealth(msg.payload)
      cachedSysHealth = msg.payload
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
              <div style={{ marginTop: 24, padding: '20px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 15, fontWeight: 900, letterSpacing: '0.05em' }}>DETAIL PARAMETER TEKNIS</div>
                
                <InfoRow 
                  label="Status Web" 
                  value={getStatusEmojiAndText(website.status)} 
                  valueColor={website.status === 'ONLINE' ? '#10b981' : website.status === 'CRITICAL' ? '#f59e0b' : '#ef4444'} 
                />
                
                <InfoRow 
                  label="Status DNS" 
                  value={getDnsStatus(website.status, website.dns_resolved)} 
                  valueColor={website.dns_resolved ? '#10b981' : (website.status === 'OFFLINE' ? '#ef4444' : '#10b981')} 
                />
                
                <InfoRow 
                  label="Kode Respon (HTTP Code)" 
                  value={getHttpCodeValue(website.status, website.status_code, website.root_cause)} 
                  valueColor={website.status_code === 200 ? '#10b981' : (website.status === 'OFFLINE' ? 'var(--text-muted)' : '#ef4444')} 
                />
                
                {/* Dynamic Row for Kecepatan Respon (TTFB) in Critical state */}
                {website.status === 'CRITICAL' && (
                  <InfoRow 
                     label="Kecepatan Respon (TTFB)" 
                     value={`${fmt(website.ttfb_latency_ms || website.response_time_ms)} — ${getLatencyDesc(website.ttfb_latency_ms || website.response_time_ms)}`} 
                     valueColor="#f59e0b"
                  />
                )}
                
                <InfoRow 
                  label="Status SSL" 
                  value={getSslStatusText(website.status, website.ssl_valid, website.ssl_expiry_date, website.root_cause)} 
                  valueColor={
                    website.status === 'OFFLINE' ? 'var(--text-muted)' : 
                    (getSslStatusText(website.status, website.ssl_valid, website.ssl_expiry_date, website.root_cause).includes('Peringatan') ? '#f59e0b' : 
                    (website.ssl_valid ? '#10b981' : '#ef4444'))
                  } 
                />
                
                <InfoRow 
                  label="Server Load (Node Monitor)" 
                  value={getServerLoadText(sysHealth)} 
                  valueColor={sysHealth && (sysHealth.backend_cpu > 80 || sysHealth.backend_ram > 85) ? '#ef4444' : '#10b981'} 
                />
                
                <InfoRow 
                  label="IP Address" 
                  value={website.ip_address || '—'} 
                />
                
                <InfoRow 
                  label="Last Check" 
                  value={fmtTime(website.last_checked)} 
                />
              </div>
              
              {/* Analisis Narasi Kondisi */}
              <AnalisisKondisi website={website} sysHealth={sysHealth} />
              
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
