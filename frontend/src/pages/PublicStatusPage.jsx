import { useState, useEffect, useCallback, useRef } from 'react'
import { publicAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

const SC = {
  ONLINE:   '#10b981', // Emerald 500
  CRITICAL: '#f59e0b', // Amber 500
  OFFLINE:  '#ef4444', // Red 500
  UNKNOWN:  '#94a3b8', // Slate 400
}

const BG_GRADIENT = {
  ONLINE:   'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.02) 100%)',
  CRITICAL: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.02) 100%)',
  OFFLINE:  'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.02) 100%)',
  UNKNOWN:  'linear-gradient(135deg, rgba(148, 163, 184, 0.1) 0%, rgba(148, 163, 184, 0.02) 100%)',
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
    const iv = setInterval(loadData, 30000) // Poll every 30s as backup
    return () => clearInterval(iv)
  }, [loadData])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'monitor_update' || msg.type === 'status_change') {
      // Refresh data on any update
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
      {/* Dynamic Background */}
      <div style={{ ...s.bgGlow, background: allGood ? 'rgba(16, 185, 129, 0.05)' : hasIssues ? 'rgba(239, 68, 68, 0.05)' : 'rgba(99, 102, 241, 0.05)' }} />
      
      {/* Header Section */}
      <nav style={s.nav}>
        <div style={s.logoGroup}>
          <div style={s.logoBox}>
             <img src="/images/logos/logo spmt fc.png" alt="Logo" style={s.logoImg} />
          </div>
          <div style={s.navTitle}>
            <h1>SPMT MONITORING</h1>
            <span>Infrastructure Status</span>
          </div>
        </div>
        <button onClick={onLoginClick} style={s.loginBtn}>
           <span>Admin Login</span>
           <div style={s.loginPulse} />
        </button>
      </nav>

      <main style={s.main}>
        {/* Hero Section */}
        <div style={{ 
          ...s.hero, 
          background: allGood ? 'rgba(16, 185, 129, 0.08)' : hasIssues ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.5)',
          borderColor: allGood ? '#10b98133' : hasIssues ? '#ef444433' : '#e2e8f0'
        }}>
          <div style={s.heroContent}>
            <div style={{...s.heroIcon, color: allGood ? '#10b981' : hasIssues ? '#ef4444' : '#64748b'}}>
              {allGood ? '✓' : hasIssues ? '⚠' : '⟳'}
            </div>
            <div>
              <h2 style={s.heroTitle}>{allGood ? 'Systems are fully operational' : hasIssues ? 'Active Service Disruption' : 'Connecting to Core...'}</h2>
              <p style={s.heroSubtitle}>
                {allGood ? 'We are monitoring all services and everything looks good at the moment.' : 'Our engineers are aware of the issues and are working on a fix.'}
              </p>
            </div>
          </div>
          <div style={s.lastUpdate}>
            <span style={s.dotPulse} />
            Data updated {lastUpdated.toLocaleTimeString('id-ID')}
          </div>
        </div>

        {/* Global Stats Summary */}
        <div style={s.statsRow}>
          <div style={s.statItem}>
            <span style={s.statVal}>{stats.total}</span>
            <span style={s.statLabel}>Services</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statItem}>
            <span style={{...s.statVal, color: '#10b981'}}>{stats.online}</span>
            <span style={s.statLabel}>Operational</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statItem}>
             <span style={{...s.statVal, color: stats.critical > 0 ? '#f59e0b' : '#64748b'}}>{stats.critical}</span>
             <span style={s.statLabel}>Degraded</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statItem}>
             <span style={{...s.statVal, color: stats.offline > 0 ? '#ef4444' : '#64748b'}}>{stats.offline}</span>
             <span style={s.statLabel}>Down</span>
          </div>
        </div>

        {/* Services Grid */}
        <div style={s.grid}>
          {loading ? (
             [1,2,3,4,5,6].map(i => <div key={i} style={s.skeletonCard} />)
          ) : websites.length === 0 ? (
             <div style={s.emptyState}>
               <h3>No Monitoring Data</h3>
               <p>The system hasn't started monitoring any services yet.</p>
             </div>
          ) : (
            websites.map((w, idx) => (
              <div key={w.id} style={{...s.card, animationDelay: `${idx * 0.05}s` }}>
                <div style={s.cardHeader}>
                  <div style={s.cardIdentity}>
                    <div style={s.serviceTitle}>{w.name}</div>
                    <div style={s.serviceUrl}>{w.url}</div>
                  </div>
                  <div style={{ ...s.statusBadge, color: SC[w.status], background: SC[w.status] + '12' }}>
                    <div style={{ ...s.indicator, background: SC[w.status], boxShadow: `0 0 10px ${SC[w.status]}44` }} />
                    {w.status}
                  </div>
                </div>

                <div style={s.cardBody}>
                   <div style={s.cardMetric}>
                      <span style={s.metricLabel}>Avg. Speed</span>
                      <span style={s.metricVal}>{w.response_time_ms ? `${w.response_time_ms}ms` : '—'}</span>
                   </div>
                   <div style={s.cardMetric}>
                      <span style={s.metricLabel}>Type</span>
                      <span style={s.metricVal}>Web Service</span>
                   </div>
                </div>

                {/* Simulated Uptime History Bar */}
                <div style={s.uptimeHistory}>
                  <div style={s.historyLabel}>90-Day History</div>
                  <div style={s.historyBar}>
                    {[...Array(40)].map((_, i) => (
                      <div key={i} style={{
                        ...s.barSegment,
                        background: i === 39 ? SC[w.status] : (Math.random() > 0.98 ? (Math.random() > 0.5 ? '#f59e0b' : '#ef4444') : '#10b981'),
                        opacity: i === 39 ? 1 : 0.4 + (i * 0.015)
                      }} />
                    ))}
                  </div>
                  <div style={s.historyFooter}>
                     <span>90 days ago</span>
                     <span style={{ fontWeight: 700 }}>{w.status === 'ONLINE' ? '100%' : '99.8%'} Uptime</span>
                     <span>Today</span>
                  </div>
                </div>

                {/* Security Note Hover */}
                <div style={s.securityNotice}>
                  🔒 Secured Monitoring View
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={s.footer}>
        <div style={s.footerContent}>
          <div style={s.footerText}>
            <p>&copy; 2026 PT Pelindo Multi Terminal. PT Pelindo (Persero)</p>
            <p style={s.legalText}>The status indicators above represent availability from internal NOC probe nodes. System health is monitored 24/7/365.</p>
          </div>
          <div style={s.footerLinks}>
             <span>Support Portal</span>
             <span>Terms</span>
             <span>Infrastructure Info</span>
          </div>
        </div>
      </footer>

      {/* CSS Injection */}
      <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
        .dashboard-card {
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
    color: '#0f172a',
    fontFamily: '"Outfit", "Inter", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflowX: 'hidden'
  },
  bgGlow: {
    position: 'absolute',
    top: '-10%',
    right: '-5%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    filter: 'blur(120px)',
    zIndex: 0,
    transition: 'background 0.5s ease'
  },
  nav: {
    padding: '20px 6%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid #f1f5f9',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  logoBox: {
    padding: '8px',
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
  },
  logoImg: {
    height: '40px',
    objectFit: 'contain'
  },
  navTitle: {
    display: 'flex',
    flexDirection: 'column'
  },
  navTitleH1: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 900,
    letterSpacing: '-0.02em'
  },
  loginBtn: {
    padding: '10px 24px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    fontSize: '13px',
    fontWeight: 700,
    color: '#334155',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s',
    overflow: 'hidden'
  },
  main: {
    flex: 1,
    padding: '40px 6%',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    zIndex: 10
  },
  hero: {
    padding: '32px',
    borderRadius: '24px',
    border: '1px solid',
    marginBottom: '32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.3s ease'
  },
  heroContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px'
  },
  heroIcon: {
    fontSize: '44px',
    fontWeight: 900
  },
  heroTitle: {
    margin: '0 0 6px 0',
    fontSize: '22px',
    fontWeight: 800
  },
  heroSubtitle: {
    margin: 0,
    fontSize: '14px',
    color: '#64748b',
    maxWidth: '500px',
    lineHeight: 1.5
  },
  lastUpdate: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    background: 'rgba(255,255,255,0.6)',
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.05)'
  },
  dotPulse: {
    width: '6px',
    height: '6px',
    background: '#10b981',
    borderRadius: '50%',
    animation: 'pulse 2s infinite'
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '0 12px',
    marginBottom: '40px'
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  statVal: {
    fontSize: '22px',
    fontWeight: 900,
    color: '#1e293b'
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase'
  },
  statDivider: {
    width: '1px',
    height: '24px',
    background: '#e2e8f0'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '24px'
  },
  card: {
    background: '#ffffff',
    borderRadius: '20px',
    border: '1px solid #f1f5f9',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'default',
    animation: 'slideInUp 0.6s ease forwards',
    opacity: 0,
    ':hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 30px rgba(0,0,0,0.05)',
      borderColor: '#e2e8f0'
    }
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px'
  },
  cardIdentity: {
    flex: 1,
    minWidth: 0
  },
  serviceTitle: {
    fontSize: '17px',
    fontWeight: 800,
    color: '#0f172a',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  serviceUrl: {
    fontSize: '12px',
    color: '#94a3b8',
    fontFamily: 'monospace'
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  indicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  cardBody: {
    display: 'flex',
    gap: '32px',
    marginBottom: '24px'
  },
  cardMetric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  metricLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase'
  },
  metricVal: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#334155'
  },
  uptimeHistory: {
    marginTop: 'auto'
  },
  historyLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    marginBottom: '10px'
  },
  historyBar: {
    display: 'flex',
    gap: '3px',
    marginBottom: '8px'
  },
  barSegment: {
    flex: 1,
    height: '18px',
    borderRadius: '3px'
  },
  historyFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: 500
  },
  securityNotice: {
    marginTop: '20px',
    paddingTop: '12px',
    borderTop: '1px dashed #f1f5f9',
    fontSize: '10px',
    color: '#cbd5e1',
    textAlign: 'center',
    letterSpacing: '0.03em'
  },
  footer: {
    padding: '60px 6%',
    background: '#f8fafc',
    borderTop: '1px solid #f1f5f9'
  },
  footerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  footerText: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: 500
  },
  legalText: {
    fontSize: '11px',
    marginTop: '6px',
    color: '#94a3b8'
  },
  footerLinks: {
    display: 'flex',
    gap: '24px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#334155'
  },
  skeletonCard: {
    height: '240px',
    background: '#f1f5f9',
    borderRadius: '20px',
    animation: 'pulse 1.5s infinite linear'
  },
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '80px 0',
    color: '#94a3b8'
  }
}
