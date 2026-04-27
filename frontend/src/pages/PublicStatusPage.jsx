import { useState, useEffect, useCallback } from 'react'
import { publicAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

const SC = {
  ONLINE: '#117903ff',
  CRITICAL: '#f59e0b',
  OFFLINE: '#ff4757',
  ALL: '#c0b57dff'
}

const videos = [
  "/images/background/bg1.MP4",
  "/images/background/bg2.MP4"
]

function InfoModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 20, width: 600, maxWidth: '100%', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'fadeIn 0.2s ease' }}>
        <div style={{ padding: '20px 24px', background: 'var(--primary)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>!</div>
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.02em' }}>MONITORING GUIDE</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', opacity: 0.8 }}>×</button>
        </div>
        
        <div style={{ padding: 30 }}>
          <div style={{ marginBottom: 25 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 15, textTransform: 'uppercase' }}>Status Legend & Conditions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { s: 'ONLINE', c: '#117903', t: 'HTTP 200-399 + RT < 3000ms', d: 'Website sehat, responsif, dan seluruh parameter (DNS/SSL) valid.' },
                { s: 'CRITICAL', c: '#f59e0b', t: 'HTTP 5xx / RT > 5000ms / SSL Invalid', d: 'Website terdeteksi lambat atau mengalami gangguan fungsional.' },
                { s: 'OFFLINE', c: '#ff4757', t: 'DNS Fail / Connection Refused / Timeout', d: 'Website tidak dapat diakses sama sekali dari jaringan monitoring.' }
              ].map(item => (
                <div key={item.s} style={{ display: 'flex', gap: 16, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.c, marginTop: 4, flexShrink: 0, boxShadow: `0 0 10px ${item.c}44` }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: item.c }}>{item.s}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', padding: '2px 8px', background: '#e2e8f0', borderRadius: 4 }}>{item.t}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 20, background: 'rgba(15, 23, 42, 0.03)', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚙️</span> ENGINE MONITORING
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              Sistem kami melakukan pengecekan kesehatan secara berkala dengan 3 pilihan standar (<b>30s, 60s, atau 120s</b>). Data yang Anda lihat di dashboard ini bersifat <b>Real-Time (Fresh)</b> yang dikirimkan secara langsung tanpa perlu menyegarkan (refresh) halaman manual.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const CircularProgress = ({ value, total, color, label, isActive, onClick }) => {
  const size = 70
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? (value / total) * circumference : 0

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
        padding: '8px 16px', borderRadius: '12px',
        background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
        transition: 'all 0.3s ease',
        border: isActive ? `1px solid ${color}44` : '1px solid transparent'
      }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', fontWeight: 800, color: '#fff'
        }}>
          {value}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '60px' }}>
        <span style={{ fontSize: '9px', fontWeight: 900, color: '#fff', letterSpacing: '0.15em', opacity: 0.8 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '20px', fontWeight: 900, color: '#fff' }}>{value}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>/ {total}</span>
        </div>
      </div>
    </div>
  )
}

export default function PublicStatusPage({ onLoginClick }) {
  const [websites, setWebsites] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [filter, setFilter] = useState('ALL')
  const [videoIndex, setVideoIndex] = useState(0)

  const handleVideoEnd = () => {
    setVideoIndex((prev) => (prev + 1) % videos.length)
  }

  const getStatusInfo = (w) => {
    if (w.status === 'OFFLINE') return 'TIMEOUT | OFFLINE'

    const code = w.status_code || 200
    const ms = w.response_time_ms > 0 ? `${w.response_time_ms}ms` : '---'

    let msg = 'OK'
    if (code === 404) msg = 'NOT FOUND'
    else if (code >= 500) msg = 'SERVER ERR'
    else if (code >= 400) msg = 'ERROR'

    return `${code} ${msg} | ${ms}`
  }

  const getFavicon = (website) => {
    if (website.favicon_url) return website.favicon_url;
    try {
      const domain = new URL(website.url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch (e) {
      return null;
    }
  }

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const res = await publicAPI.getStatus()
      setWebsites(res.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadData()
    const iv = setInterval(loadData, 30000)
    return () => clearInterval(iv)
  }, [loadData])

  const [showInfo, setShowInfo] = useState(false)

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'monitor_update' || msg.type === 'status_change') loadData()
  }, [loadData])

  useWebSocket(handleWsMessage)

  const stats = {
    all: websites.length,
    online: websites.filter(w => w.status === 'ONLINE').length,
    critical: websites.filter(w => w.status === 'CRITICAL').length,
    offline: websites.filter(w => w.status === 'OFFLINE').length,
  }

  const filteredWebsites = websites.filter(w => filter === 'ALL' || w.status === filter)

  return (
    <div style={s.root}>
      {/* BACKGROUND VIDEO OVERLAY */}
      <div style={s.videoOverlay}>
        <video
          autoPlay muted playsInline
          onEnded={handleVideoEnd}
          className="night-port-video"
          style={s.videoBg}
          src={videos[videoIndex]}
        />
        <div style={s.videoTint} />
      </div>

      {/* TOP HEADER PANEL */}
      <div className="glass-panel" style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logoCard}>
            <img src="/images/logos/lo.png" alt="Logo" style={s.logo} />
          </div>
        </div>

        <div style={s.headerCenter}>
          <CircularProgress label="ALL" value={stats.all} total={stats.all} color={SC.ALL} isActive={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          <CircularProgress label="ONLINE" value={stats.online} total={stats.all} color={SC.ONLINE} isActive={filter === 'ONLINE'} onClick={() => setFilter('ONLINE')} />
          <CircularProgress label="CRITICAL" value={stats.critical} total={stats.all} color={SC.CRITICAL} isActive={filter === 'CRITICAL'} onClick={() => setFilter('CRITICAL')} />
          <CircularProgress label="OFFLINE" value={stats.offline} total={stats.all} color={SC.OFFLINE} isActive={filter === 'OFFLINE'} onClick={() => setFilter('OFFLINE')} />
          
          <button 
            onClick={() => setShowInfo(true)}
            style={{ 
              width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', 
              border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 16, fontWeight: 900, 
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease', marginLeft: 10
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            title="Monitoring Info"
          >
            !
          </button>
        </div>

        <div style={s.headerRight}>
          <button onClick={onLoginClick} style={s.loginBtn} className="hover-lift">
            Log-In
          </button>
          <div style={s.timeContainer}>
            <div style={s.time}>{currentTime.toLocaleTimeString('id-ID', { hour12: false })}</div>
            <div style={s.date}>{currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={s.main}>
        <div style={s.grid}>
          {filteredWebsites.map((w) => {
            const finalFavicon = getFavicon(w);
            return (
              <div key={w.id} className="glass-panel neon-underglow-teal ripple-card hover-expand" style={s.card}>
                <div className="ripple-wave" />

                {/* Air Bubbles Effect */}
                <div className="bubble" style={{ left: '10%', width: '10px', height: '10px', animationDelay: '0s' }} />
                <div className="bubble" style={{ left: '30%', width: '6px', height: '6px', animationDelay: '0.4s' }} />
                <div className="bubble" style={{ left: '50%', width: '12px', height: '12px', animationDelay: '0.8s' }} />
                <div className="bubble" style={{ left: '70%', width: '8px', height: '8px', animationDelay: '1.2s' }} />
                <div className="bubble" style={{ left: '85%', width: '5px', height: '5px', animationDelay: '1.6s' }} />

                <div className="card-content-wrap">
                  <div style={s.cardTop}>
                    {finalFavicon ? (
                      <img src={finalFavicon} alt="" style={s.favicon} />
                    ) : (
                      <div style={s.faviconPlaceholder}>🌐</div>
                    )}
                  </div>
                  <div style={s.cardBody}>
                    <div style={s.websiteName}>{w.name}</div>
                    <div style={{ 
                      ...s.latency, 
                      color: w.status === 'ONLINE' ? SC.ONLINE : w.status === 'OFFLINE' ? SC.OFFLINE : SC.CRITICAL,
                      filter: `drop-shadow(0 0 8px ${w.status === 'ONLINE' ? SC.ONLINE : w.status === 'OFFLINE' ? SC.OFFLINE : SC.CRITICAL}44)`
                    }}>
                      {getStatusInfo(w)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

const s = {
  root: {
    width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
    display: 'flex', flexDirection: 'column', color: '#fff',
    fontFamily: '"Inter", sans-serif'
  },
  videoOverlay: {
    position: 'absolute', inset: 0, zIndex: -1, background: '#f1f5f9'
  },
  videoBg: {
    width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8
  },
  videoTint: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(135deg, rgba(157, 156, 156, 0.26) 0%, rgba(231, 233, 234, 0.2) 100%)'
  },
  header: {
    margin: '20px 30px', padding: '0 40px', height: '90px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: '20px', background: 'rgba(12, 57, 86, 0.45)',
    backdropFilter: 'blur(10px)', border: '1px solid rgba(84, 155, 195, 1)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.05)'
  },
  headerLeft: { display: 'flex', alignItems: 'center' },
  logoCard: {
    background: '#c8d6dfff', padding: '6px 16px', borderRadius: '12px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '1px solid #bae6fd',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  logo: { height: '48px', width: 'auto', objectFit: 'contain' },
  headerCenter: { display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '30px', flexShrink: 0 },
  loginBtn: {
    background: 'rgba(181, 208, 4, 0.83)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#000000ff', padding: '10px 26px', borderRadius: '30px', cursor: 'pointer',
    fontSize: '11px', fontWeight: 900, letterSpacing: '0.12em',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 1)'
  },
  timeContainer: { textAlign: 'right' },
  time: {
    fontSize: '24px', fontWeight: 800, lineHeight: 1,
    fontVariantNumeric: 'tabular-nums', width: '135px', display: 'inline-block',
    color: '#feffffff'
  },
  date: { fontSize: '10px', fontWeight: 700, color: '#d8dde5ff', marginTop: '4px' },
  main: {
    flex: 1, padding: '0 40px 20px 40px',
    overflowY: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(10, 1fr)',
    gap: '12px',
    padding: '10px',
    width: '100%',
    maxWidth: '1800px'
  },
  card: {
    position: 'relative', borderRadius: '14px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '12px 8px',
    minHeight: '135px',
    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    cursor: 'pointer', background: 'rgba(255, 255, 255, 0.47)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(25, 87, 202, 0.86)',
  },
  cardTop: { marginBottom: '10px' },
  favicon: { width: '42px', height: '42px', objectFit: 'contain' },
  faviconPlaceholder: { fontSize: '40px' },
  cardBody: { textAlign: 'center' },
  websiteName: { 
    fontSize: '13px', 
    fontWeight: 800, 
    marginBottom: '4px', 
    whiteSpace: 'nowrap', 
    overflow: 'hidden', 
    textOverflow: 'ellipsis', 
    width: '110px',
    color: '#05153cff'
  },
  latency: { 
    fontSize: '11px', 
    fontWeight: 800, 
    letterSpacing: '0.12em', 
    lineHeight: '1.6',
    marginBottom: '8px' 
  },
  extraInfo: {
    display: 'flex', flexDirection: 'column', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '4px', gap: '2px'
  },
  infoLabel: { fontSize: '7px', fontWeight: 900, color: 'rgba(15, 23, 42, 0.6)', letterSpacing: '0.05em' },
  infoValue: { fontSize: '9px', fontWeight: 700, color: 'rgba(255, 255, 255, 1)' }
}
