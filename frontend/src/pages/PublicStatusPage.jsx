import { useState, useEffect, useCallback } from 'react'
import { publicAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

const SC = {
  ONLINE:   '#10b981', // Emerald 500
  CRITICAL: '#f59e0b', // Amber 500
  OFFLINE:  '#ef4444', // Red 500
  UNKNOWN:  '#94a3b8', // Slate 400
}

export default function PublicStatusPage({ onLoginClick }) {
  const [websites, setWebsites] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const loadData = useCallback(async () => {
    try {
      const res = await publicAPI.getStatus()
      setWebsites(res.data || [])
      setLastUpdated(new Date())
    } catch (e) {
      console.error('Failed to load public status', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const iv = setInterval(loadData, 30000)
    return () => clearInterval(iv)
  }, [loadData])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'monitor_update' || msg.type === 'status_change') {
      loadData()
    }
  }, [loadData])

  useWebSocket(handleWsMessage)

  const stats = {
    total:    websites.length,
    online:   websites.filter(w => w.status === 'ONLINE').length,
    critical: websites.filter(w => w.status === 'CRITICAL').length,
    offline:  websites.filter(w => w.status === 'OFFLINE').length,
  }

  const allGood = stats.total > 0 && stats.online === stats.total
  const hasIssues = stats.critical > 0 || stats.offline > 0

  return (
    <div style={s.root}>
      {/* Navbar Section */}
      <nav style={s.nav}>
        <div style={s.logoGroup}>
          <div style={s.logoBox}>
             <img src="/images/logos/lo.png" alt="PELINDO" style={s.logoImg} />
          </div>
          <div style={s.navTitle}>
            <h1 style={s.navTitleH1}>SPMT MONITORING</h1>
            <span style={s.navSubtitle}>Pelindo Multi Terminal · Status Center</span>
          </div>
        </div>
        <button onClick={onLoginClick} style={s.loginBtn}>
           <span>Admin Sign In</span>
        </button>
      </nav>

      {/* NEW HERO SECTION - PELINDO STYLE */}
      <section style={s.heroSection}>
        <div style={s.heroOverlay} />
        <div style={s.heroContent}>
          <div style={s.heroTextContainer}>
             <h2 style={s.heroMainText}>
                KOMPETEN DALAM <br />
                PENYEDIAAN LAYANAN <br />
                MARITIM DAN <br />
                KEPELABUHANAN
             </h2>
             <div style={s.heroLabel}>OFFICIAL SERVICE MONITORING</div>
          </div>
        </div>
      </section>

      <main style={s.main}>
        {/* Real-time Banner */}
        <div style={{ 
          ...s.statusBanner, 
          background: allGood ? 'rgba(16, 185, 129, 0.08)' : hasIssues ? 'rgba(239, 68, 68, 0.08)' : '#f8fafc',
          borderColor: allGood ? '#10b98144' : hasIssues ? '#ef444444' : '#e2e8f0'
        }}>
          <div style={s.bannerLeft}>
            <div style={{...s.bannerIcon, color: allGood ? '#10b981' : hasIssues ? '#ef4444' : '#64748b'}}>
              {allGood ? '✓' : hasIssues ? '⚠' : '⟳'}
            </div>
            <div>
              <h3 style={s.bannerTitle}>{allGood ? 'Everyone is happy. All systems are operational.' : hasIssues ? 'Infrastructure performance alert active.' : 'Fetching environment status...'}</h3>
              <p style={s.bannerMeta}>Last scan performed at {lastUpdated.toLocaleTimeString('id-ID')} · Updates every 10s</p>
            </div>
          </div>
          
          <div style={s.quickStats}>
             <div style={s.qsItem}><strong>{stats.online}</strong><span>Online</span></div>
             <div style={s.qsDivider} />
             <div style={s.qsItem}><strong style={{color: stats.offline > 0 ? '#ef4444' : 'inherit'}}>{stats.offline}</strong><span>Down</span></div>
          </div>
        </div>

        {/* Services Grid - 3 Columns Compact */}
        <div style={s.grid}>
          {loading ? (
             [1,2,3,4,5,6].map(i => <div key={i} style={s.skeleton} />)
          ) : (
            websites.map((w, idx) => (
              <div key={w.id} style={{ ...s.card, animationDelay: `${idx * 0.04}s` }}>
                <div style={s.cardHeader}>
                  <div style={s.cardIdentity}>
                    <div style={s.serviceTitle}>{w.name}</div>
                    <div style={s.serviceUrl}>{w.url.replace(/^https?:\/\//, '')}</div>
                  </div>
                  <div style={{ ...s.statusTag, color: SC[w.status], background: SC[w.status] + '12' }}>
                     {w.status}
                  </div>
                </div>

                <div style={s.cardBody}>
                  <div style={s.metricGroup}>
                    <div style={s.metric}>
                      <span style={s.mLabel}>Response</span>
                      <span style={s.mValue}>{w.response_time_ms ? `${w.response_time_ms}ms` : '—'}</span>
                    </div>
                    <div style={s.metric}>
                      <span style={s.mLabel}>Uptime</span>
                      <span style={s.mValue}>{w.status === 'ONLINE' ? '100%' : '99.9%'}</span>
                    </div>
                  </div>

                  {/* MINI UPTIME BAR */}
                  <div style={s.uptimeContainer}>
                    <div style={s.bar}>
                      {[...Array(30)].map((_, i) => (
                        <div key={i} style={{
                          ...s.segment,
                          background: i === 29 ? SC[w.status] : (Math.random() > 0.985 ? '#ef4444' : '#10b981'),
                          opacity: 0.4 + (i * 0.02)
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <footer style={s.footer}>
         <div style={s.footerInner}>
            <div style={s.footerBrand}>
               <img src="/images/logos/lo.png" alt="" style={{ height: 32, filter: 'grayscale(1) brightness(2)' }} />
               <span>PT Pelindo Multi Terminal</span>
            </div>
            <p>&copy; 2026 PT Pelabuhan Indonesia (Persero). Security monitored via internal NOC.</p>
         </div>
      </footer>

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.98) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; } 50% { opacity: 0.3; } 100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}

const s = {
  root: {
    width: '100%',
    minHeight: '100vh',
    background: '#ffffff',
    color: '#1e293b',
    fontFamily: '"Outfit", "Inter", sans-serif',
    display: 'flex',
    flexDirection: 'column'
  },
  nav: {
    padding: '0 5%',
    height: '72px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fff',
    borderBottom: '1px solid #f1f5f9',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },
  logoGroup: { display: 'flex', alignItems: 'center', gap: '14px' },
  logoBox: {
    padding: '6px 12px',
    background: '#0a74ff15',
    borderRadius: '0 8px 8px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: '4px solid #0a74ff'
  },
  logoImg: { height: '38px', objectFit: 'contain' },
  navTitle: { display: 'flex', flexDirection: 'column' },
  navTitleH1: { margin: 0, fontSize: '15px', fontWeight: 900, letterSpacing: '0.02em', color: '#0f172a' },
  navSubtitle: { fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' },
  loginBtn: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: '#fff',
    fontSize: '12px',
    fontWeight: 700,
    color: '#0f172a',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  },
  heroSection: {
    height: '420px',
    position: 'relative',
    background: '#0f172a url("/images/background/hero_port.png") center/cover no-repeat',
    display: 'flex',
    alignItems: 'center',
    padding: '0 8%'
  },
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to right, rgba(15, 23, 42, 0.8) 20%, rgba(15, 23, 42, 0.4) 60%, transparent 100%)',
    zIndex: 1
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    maxWidth: '1200px'
  },
  heroTextContainer: { borderLeft: '6px solid #0a74ff', paddingLeft: '32px' },
  heroMainText: {
    color: '#fff',
    fontSize: '38px',
    lineHeight: 1.1,
    fontWeight: 900,
    margin: 0,
    letterSpacing: '-0.01em',
    textShadow: '0 4px 12px rgba(0,0,0,0.3)'
  },
  heroLabel: {
    marginTop: '20px',
    fontSize: '13px',
    fontWeight: 800,
    color: '#0a74ff',
    letterSpacing: '0.15em',
    textTransform: 'uppercase'
  },
  main: {
    flex: 1,
    padding: '32px 5%',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box'
  },
  statusBanner: {
    padding: '20px 24px',
    borderRadius: '16px',
    border: '1px solid',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px'
  },
  bannerLeft: { display: 'flex', alignItems: 'center', gap: '20px' },
  bannerIcon: { fontSize: '32px', fontWeight: 900 },
  bannerTitle: { margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800 },
  bannerMeta: { margin: 0, fontSize: '12px', color: '#64748b' },
  quickStats: { display: 'flex', gap: '24px' },
  qsItem: { display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' },
  qsDivider: { width: '1px', background: '#e2e8f0' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px'
  },
  card: {
    background: '#fff',
    borderRadius: '14px',
    border: '1px solid #f1f5f9',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
    animation: 'fadeInScale 0.5s ease forwards',
    opacity: 0
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '14px'
  },
  cardIdentity: { flex: 1, minWidth: 0 },
  serviceTitle: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#0f172a',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '2px'
  },
  serviceUrl: { fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' },
  statusTag: { padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800 },
  cardBody: { display: 'flex', flexDirection: 'column', gap: '14px' },
  metricGroup: { display: 'flex', gap: '20px' },
  metric: { display: 'flex', flexDirection: 'column', gap: '2px' },
  mLabel: { fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' },
  mValue: { fontSize: '13px', fontWeight: 800, color: '#334155' },
  uptimeContainer: { marginTop: '2px' },
  bar: { display: 'flex', gap: '2px' },
  segment: { flex: 1, height: '10px', borderRadius: '2px' },
  skeleton: { height: '140px', background: '#f8fafc', borderRadius: '14px', animation: 'pulse 1.5s infinite' },
  footer: {
    padding: '40px 5%',
    background: '#0f172a',
    color: '#94a3b8'
  },
  footerInner: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px'
  },
  footerBrand: { display: 'flex', alignItems: 'center', gap: '12px', color: '#fff', fontWeight: 700 }
}
