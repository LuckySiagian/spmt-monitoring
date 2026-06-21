import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { systemAPI } from '../../services/api'
import { useGlobalWebSocket } from '../../store/WebSocketContext'
import { useTheme } from '../../store/theme'

const LOCALE_MAP = { id: 'id-ID', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU' }

// Format a throughput rate (in Mbps) into a human-friendly string with adaptive units.
function formatRate(mbps) {
  if (mbps == null || isNaN(mbps)) return '—'
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
  if (mbps > 0) return `${(mbps * 1000).toFixed(0)} Kbps`
  return '0 Kbps'
}

// ── Animated gauge bar ─────────────────────────────────────────
function GaugeBar({ label, value, max = 100, warnAt, critAt, unit = '%', color = '#6366f1' }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const isCrit = critAt != null && value >= critAt
  const isWarn = warnAt != null && value >= warnAt && !isCrit
  const barColor = isCrit ? '#ef4444' : isWarn ? '#f59e0b' : color
  const textColor = isCrit ? '#ef4444' : isWarn ? '#f59e0b' : '#f1f5f9'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 800, letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 1000, color: textColor, fontVariantNumeric: 'tabular-nums' }}>
          {value != null ? `${typeof value === 'number' && unit === '%' ? Math.round(value) : value}${unit}` : '—'}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: `linear-gradient(90deg, ${barColor}aa, ${barColor})`,
          boxShadow: (isCrit || isWarn) ? `0 0 10px ${barColor}88` : 'none',
          transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />
      </div>
      {isCrit && (
        <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 800 }}>
          ● CRITICAL — Exceeds {critAt}{unit} threshold
        </span>
      )}
      {isWarn && (
        <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 800 }}>
          ● WARNING — Exceeds {warnAt}{unit} threshold
        </span>
      )}
    </div>
  )
}

// ── Stat chip ─────────────────────────────────────────────────
function StatChip({ icon, label, value, color = '#94a3b8' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 800, letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 1000, color, fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</div>
    </div>
  )
}

// ── Network row ───────────────────────────────────────────────
function NetRow({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', fontFamily: mono ? 'monospace' : 'inherit', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ── Recommendation card ───────────────────────────────────────
function RecommendationCard({ cpu, ram }) {
  const tips = []
  if (cpu >= 80) {
    tips.push({
      icon: '🔥',
      title: 'CPU Tinggi',
      body: 'Monitor sedang memproses banyak job secara bersamaan. Pertimbangkan mengurangi interval cek atau meningkatkan jumlah worker pool untuk membagi beban.',
    })
  }
  if (ram >= 85) {
    tips.push({
      icon: '💾',
      title: 'RAM Tinggi',
      body: 'Konsumsi memori mendekati batas. Hal ini dapat disebabkan oleh cache favicon, antrian job yang besar, atau goroutine yang tidak dilepas. Restart server jika berlanjut.',
    })
  }
  if (tips.length === 0) {
    tips.push({
      icon: '✅',
      title: 'Performa Normal',
      body: 'CPU dan RAM dalam batas aman. Sistem berjalan optimal. Tidak ada tindakan yang diperlukan saat ini.',
      ok: true,
    })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tips.map((t, i) => (
        <div key={i} style={{
          background: t.ok ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
          border: `1px solid ${t.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          borderRadius: 10, padding: '12px 16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: t.ok ? '#10b981' : '#f87171', marginBottom: 5 }}>
            {t.icon} {t.title}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65 }}>{t.body}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────
export default function ServerDetailModal({ onClose }) {
  const { t, lang } = useTheme()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await systemAPI.getHealth()
      if (res.data) setHealth(res.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchHealth()
    const timer = setInterval(fetchHealth, 4000)
    return () => clearInterval(timer)
  }, [fetchHealth])

  useGlobalWebSocket(useCallback((msg) => {
    if (msg.type === 'system_health') setHealth(msg.payload)
  }, []))

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const cpu = health?.backend_cpu ?? 0
  const ram = health?.backend_ram ?? 0
  const overallStatus = (cpu >= 80 || ram >= 85) ? 'KRITIS' : (cpu >= 60 || ram >= 70) ? 'PERINGATAN' : 'NORMAL'
  const statusColor = overallStatus === 'KRITIS' ? '#ef4444' : overallStatus === 'PERINGATAN' ? '#f59e0b' : '#10b981'
  const overallStatusLabel = overallStatus === 'KRITIS' ? t.critical : overallStatus === 'PERINGATAN' ? t.warning : t.srvNormal

  const updatedAt = health?.updated_at ? new Date(health.updated_at).toLocaleTimeString(locale, { hour12: false }) : null

  return createPortal(
    <div
      id="server-detail-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(5, 10, 25, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'srvFadeIn 0.25s ease',
      }}
    >
      <style>{`
        @keyframes srvFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes srvSlideUp { from { opacity: 0; transform: translateY(28px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .srv-scroll::-webkit-scrollbar { width: 4px; }
        .srv-scroll::-webkit-scrollbar-track { background: transparent; }
        .srv-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      <div
        id="server-detail-modal"
        style={{
          width: '100%', maxWidth: 720,
          maxHeight: '90vh',
          background: 'linear-gradient(160deg, rgba(15,23,42,0.99) 0%, rgba(10,15,35,0.99) 100%)',
          border: `1px solid ${statusColor}33`,
          borderRadius: 24,
          boxShadow: `0 0 0 1px ${statusColor}22, 0 40px 80px rgba(0,0,0,0.7), 0 0 60px ${statusColor}18`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'srvSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          margin: 16,
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: `linear-gradient(135deg, ${statusColor}12 0%, transparent 60%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Pulsing status dot */}
            <div style={{ position: 'relative', width: 16, height: 16 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: statusColor, opacity: 0.3,
                animation: 'pulse-ring 1.8s ease-out infinite',
              }} />
              <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: statusColor }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 1000, color: '#fff', letterSpacing: '0.04em' }}>SPMT SERVER MONITOR</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {t.srvLocalSystem} · {updatedAt ? `${t.srvUpdated} ${updatedAt}` : `${t.loading}`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {health?.net_rx_mbps != null && (
              <span
                style={{
                  fontSize: 12, fontWeight: 900,
                  background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.32)',
                  padding: '6px 12px', borderRadius: 8, letterSpacing: '0.02em',
                  display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                  position: 'relative',
                  cursor: 'default',
                }}
              >
                <span style={{ fontSize: 13 }}>📶</span>
                <span style={{ color: '#38bdf8' }}>↓ {formatRate(health.net_rx_mbps)}</span>
                <span style={{ color: '#a78bfa' }}>↑ {formatRate(health.net_tx_mbps)}</span>
              </span>
            )}
            <span style={{
              fontSize: 12, fontWeight: 900, color: statusColor,
              background: `${statusColor}18`, border: `1px solid ${statusColor}40`,
              padding: '6px 14px', borderRadius: 8, letterSpacing: '0.07em',
            }}>{overallStatusLabel}</span>
            <button
              id="server-modal-close"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)', width: 34, height: 34, borderRadius: 10,
                cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            >×</button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="srv-scroll" style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              {t.srvLoading}
            </div>
          ) : (
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── CPU & RAM ── */}
              <section>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 14 }}>{t.srvResourceUsage}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <GaugeBar label={t.cpuUsage} value={cpu} warnAt={60} critAt={80} color="#6366f1" />
                  <GaugeBar label={t.ramUsage} value={ram} warnAt={70} critAt={85} color="#8b5cf6" />
                </div>
              </section>

              {/* ── Worker stats ── */}
              <section>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 14 }}>{t.srvWorkerRuntime}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <StatChip icon="⚙️" label={t.srvActiveWorkers} value={health?.active_workers} color="#38bdf8" />
                  <StatChip icon="📋" label={t.srvQueueSize} value={health?.worker_queue_size} color="#a78bfa" />
                  <StatChip icon="🔀" label={t.srvGoroutines} value={health?.active_goroutines} color="#34d399" />
                  <StatChip icon="🔌" label={t.srvWsConn} value={health?.ws_connections} color="#fb923c" />
                </div>
              </section>

              {/* ── Network ── */}
              <section>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 14 }}>{t.srvNetworkInfo}</div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '4px 16px' }}>
                  <NetRow label={t.srvConnType} value={health?.network_type} />
                  <NetRow label={t.srvNetName} value={health?.network_name} />
                  <NetRow label={t.srvLinkSpeed} value={health?.link_speed} mono />
                  <NetRow label={t.srvInterface} value={health?.interface_alias} mono />
                  <NetRow label={t.rowIpAddress} value={health?.public_ip} mono />
                  <NetRow label={t.srvGateway} value={health?.local_gateway} mono />
                  <NetRow label={t.srvDnsResolver} value={health?.dns_resolver} mono />
                </div>
              </section>

              {/* ── Recommendations ── */}
              <section>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 14 }}>{t.srvAnalysis}</div>
                <RecommendationCard cpu={cpu} ram={ram} />
              </section>

              {/* ── Network Speed Threshold Info ── */}
              <section style={{ animation: 'srvFadeIn 0.3s ease-out' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 14 }}>AMBANG BATAS & INDIKATOR JARINGAN</div>
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}>
                  {/* Arrow Explanations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#38bdf8' }}>↓ Panah Bawah (Download / Rx)</span>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.45 }}>
                        Kecepatan unduh server monitor saat menerima data/respons dari target.
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#a78bfa' }}>↑ Panah Atas (Upload / Tx)</span>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.45 }}>
                        Kecepatan unggah server monitor saat mengirimkan permintaan cek ke target.
                      </span>
                    </div>
                  </div>

                  {/* Status List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Safe */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                        <span style={{ fontSize: 12, fontWeight: 900, color: '#10b981' }}>AMAN (&gt; 1 Mbps)</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.45, paddingLeft: 16 }}>
                        Koneksi optimal. Pengecekan website berjalan lancar secara paralel tanpa antrean job.
                      </span>
                    </div>

                    {/* Slow */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }} />
                        <span style={{ fontSize: 12, fontWeight: 900, color: '#fbbf24' }}>LELET / LAMBAT (&le; 512 Kbps)</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.45, paddingLeft: 16 }}>
                        Kinerja menurun. Pengecekan rentan mengalami penundaan, antrean bertumpuk, atau pemicuan false alarm (timeout palsu).
                      </span>
                    </div>

                    {/* Offline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                        <span style={{ fontSize: 12, fontWeight: 900, color: '#ef4444' }}>OFFLINE / MATI (0 Kbps / —)</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.45, paddingLeft: 16 }}>
                        Koneksi terputus total. Server monitor kehilangan akses internet. Semua status target akan dianggap terputus (Offline) oleh sistem.
                      </span>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 28px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{t.srvAutoRefresh}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#10b981' }}>{t.liveCaps}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
