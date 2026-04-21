import { useState, useEffect, useCallback } from 'react'
import { publicAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

const SC = {
  ONLINE: 'var(--online)',
  CRITICAL: 'var(--critical)',
  OFFLINE: 'var(--offline)',
}

export default function PublicStatusPage({ onLoginClick }) {
  const [websites, setWebsites] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [filter, setFilter] = useState('ALL')

  // Clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const res = await publicAPI.getStatus()
      setWebsites(res.data || [])
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
    online: websites.filter(w => w.status === 'ONLINE').length,
    critical: websites.filter(w => w.status === 'CRITICAL').length,
    offline: websites.filter(w => w.status === 'OFFLINE').length,
  }

  const filteredWebsites = websites.filter(w => {
    if (filter === 'ALL') return true
    return w.status === filter
  })

  const formatDateTime = (date) => {
    return date.toLocaleString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div style={s.root}>
      {/* HUD Background elements */}
      <div style={s.bgGlow1} />
      <div style={s.bgGlow2} />
      <div style={s.gridOverlay} />

      {/* Navbar Section */}
      <nav style={s.nav}>
        <div style={s.logoGroup}>
          <div style={s.logoWrapper}>
            <img src="/images/logos/lo.png" alt="PLTM-S Logo" style={s.logoImg} />
          </div>
          
          {/* Header Status Metrics - Moved here */}
          <div style={s.headerStats}>
            <div className={`status-box all ${filter === 'ALL' ? 'active' : ''}`} 
                 onClick={() => setFilter('ALL')}
                 style={{...s.hudStatItem, color: 'var(--accent)', cursor: 'pointer'}}>
              <span style={s.hudStatLabel}>ALL</span>
              <span style={s.hudStatValue}>{websites.length}</span>
            </div>
            <div className={`status-box online ${filter === 'ONLINE' ? 'active' : ''}`} 
                 onClick={() => setFilter(filter === 'ONLINE' ? 'ALL' : 'ONLINE')}
                 style={{...s.hudStatItem, color: SC.ONLINE, cursor: 'pointer'}}>
              <span style={s.hudStatLabel}>ONLINE</span>
              <span style={s.hudStatValue}>{stats.online}</span>
            </div>
            <div className={`status-box critical ${filter === 'CRITICAL' ? 'active' : ''}`}
                 onClick={() => setFilter(filter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
                 style={{...s.hudStatItem, color: SC.CRITICAL, cursor: 'pointer'}}>
              <span style={s.hudStatLabel}>CRITICAL</span>
              <span style={s.hudStatValue}>{stats.critical}</span>
            </div>
            <div className={`status-box offline ${filter === 'OFFLINE' ? 'active' : ''}`}
                 onClick={() => setFilter(filter === 'OFFLINE' ? 'ALL' : 'OFFLINE')}
                 style={{...s.hudStatItem, color: SC.OFFLINE, cursor: 'pointer'}}>
              <span style={s.hudStatLabel}>OFFLINE</span>
              <span style={s.hudStatValue}>{stats.offline}</span>
            </div>
          </div>
        </div>

        <div style={s.navRight}>
          <button className="cyber-btn" onClick={onLoginClick}>
            <span>LOGIN SYSTEM</span>
          </button>
          <div style={s.clockBox}>
             <div style={s.clockLabel}>SYSTEM TIME</div>
             <div style={s.clockTime}>{currentTime.toLocaleTimeString('id-ID', { hour12: false })}</div>
             <div style={s.clockDate}>{currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </div>
        </div>
      </nav>

      <main style={s.main}>

        {/* Services Grid - Boxes */}
        <div style={s.grid}>
          {loading ? (
             [1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} style={s.skeleton} />)
          ) : (
            filteredWebsites.map((w, idx) => {
              let statusColor = SC.ONLINE;
              if (w.status === 'CRITICAL') statusColor = SC.CRITICAL;
              if (w.status === 'OFFLINE') statusColor = SC.OFFLINE;

              const domain = w.url ? w.url.replace('https://', '').replace('http://', '').split('/')[0] : '';

              return (
                <div key={w.id} className="diamond-node" style={{ 
                  animationDelay: `${idx * 0.05}s`, 
                  '--status-color': statusColor 
                }}>
                  <div className="diamond-shape">
                    <div className="diamond-content">
                       <img 
                         src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} 
                         style={s.nodeIcon} 
                         alt=""
                         onError={(e) => e.target.style.display = 'none'}
                       />
                       <div style={{...s.nodeName, color: statusColor}}>{w.name}</div>
                       <div style={s.nodeLatency}>{w.status === 'OFFLINE' ? 'OFFLINE' : `${w.response_time_ms || 0}ms`}</div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;600;700&display=swap');

        @keyframes cyberFadeIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); filter: blur(5px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes pulseGlow {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        
        .cyber-btn {
          position: relative;
          padding: 10px 24px;
          background: rgba(0, 163, 255, 0.1);
          border: 1px solid #00a3ff;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.3s ease;
          clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cyber-btn span {
          position: relative;
          z-index: 2;
          color: var(--accent);
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .cyber-btn:hover {
          background: var(--accent-light);
          box-shadow: 0 0 15px var(--accent-light) inset;
        }

        .cyber-btn::before {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, var(--accent-light), transparent);
          transform: skewX(-45deg);
          transition: left 0.5s ease;
          z-index: 1;
        }

        .cyber-btn:hover::before {
          left: 150%;
        }

        .node-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(10px);
          animation: cyberFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease;
          clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px));
        }

        .node-card:hover { transform: translateY(-5px); }

        .diamond-node {
          width: 125px;
          height: 125px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: cyberFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }

        .diamond-shape {
          width: 100px;
          height: 100px;
          background: var(--bg-card);
          border: 2px solid var(--status-color);
          transform: rotate(45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          box-shadow: 0 0 10px var(--status-color)11;
          position: relative;
        }

        .diamond-node:hover .diamond-shape {
          transform: rotate(45deg) scale(1.1);
          box-shadow: 0 0 20px var(--status-color)55;
          background: white;
        }

        .status-box.active {
          background: white;
          border: 2px solid currentColor;
          box-shadow: 0 0 15px currentColor;
          transform: scale(1.05);
        }

        .diamond-content {
          transform: rotate(-45deg);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          width: 100%;
        }

        .status-box {
          border: 1px solid currentColor;
          background: rgba(255,255,255,0.8);
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.3s;
          min-width: 100px;
        }
        .status-box:hover {
          background: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px currentColor;
        }
        .status-box.online { animation: glowPulseOnline 2s infinite; }
        .status-box.critical { animation: glowPulseCritical 2s infinite; }
        .status-box.offline { animation: glowPulseOffline 2s infinite; }

        @keyframes glowPulseOnline { 0%, 100% { box-shadow: 0 0 5px var(--online); } 50% { box-shadow: 0 0 15px var(--online); } }
        @keyframes glowPulseCritical { 0%, 100% { box-shadow: 0 0 5px var(--critical); } 50% { box-shadow: 0 0 15px var(--critical); } }
        @keyframes glowPulseOffline { 0%, 100% { box-shadow: 0 0 5px var(--offline); } 50% { box-shadow: 0 0 15px var(--offline); } }
      `}</style>
    </div>
  )
}

const s = {
  root: {
    width: '100%',
    minHeight: '100vh',
    background: 'var(--bg-main)',
    backgroundImage: `linear-gradient(rgba(241, 245, 249, 0.3), rgba(241, 245, 249, 0.3)), url('/at-pelindo-bg.png')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    color: 'var(--text)',
    fontFamily: '"Rajdhani", "Inter", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflowX: 'hidden'
  },
  logoGroup: { display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1 },
  logoWrapper: {
    padding: '4px',
    maxWidth: '200px',
    display: 'flex',
    alignItems: 'center'
  },
  logoImg: { height: '80px', maxWidth: '100%', objectFit: 'contain' },
  navRight: { display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1 },
  bgGlow2: {
    display: 'none'
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    zIndex: 0,
    pointerEvents: 'none',
    opacity: 0.5
  },
  nav: {
    padding: '0 40px',
    height: '110px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-header)',
    borderBottom: '2px solid var(--border)',
    backdropFilter: 'blur(15px)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)'
  },
  headerStats: {
    display: 'flex',
    gap: '20px',
    marginLeft: '30px'
  },
  clockBox: {
    background: 'rgba(0,0,0,0.03)',
    border: '1px solid var(--border)',
    padding: '6px 16px',
    borderRadius: '10px',
    textAlign: 'center',
    minWidth: '140px'
  },
  clockLabel: { fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px' },
  clockTime: { fontSize: '20px', fontWeight: 800, fontFamily: '"Orbitron", monospace', color: 'var(--accent)' },
  clockDate: { fontSize: '10px', color: 'var(--text-sub)', fontWeight: 600 },
  main: {
    flex: 1,
    padding: '20px 3%',
    maxWidth: '1800px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    position: 'relative',
    zIndex: 1
  },
  dashboardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 40px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    backdropFilter: 'blur(8px)',
    clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))'
  },
  hudTitle: {
    fontSize: '18px',
    fontWeight: 700,
    fontFamily: '"Orbitron", sans-serif',
    color: 'var(--text)',
    letterSpacing: '3px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },
  hudTitleDecor: {
    width: '4px',
    height: '24px',
    background: 'var(--accent)',
    boxShadow: '0 0 10px var(--accent-light)'
  },
  hudStats: {
    display: 'flex',
    gap: '50px'
  },
  hudStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  hudStatLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '3px',
    opacity: 0.9,
    textShadow: '0 0 5px rgba(0,0,0,0.5)'
  },
  hudStatValue: {
    fontSize: '32px',
    fontWeight: 700,
    fontFamily: '"Orbitron", monospace'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(10, 1fr)',
    gap: '12px',
    padding: '10px 0'
  },
  nodeHeader: {
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.05)'
  },
  nodeIcon: { width: 45, height: 45, marginBottom: 2, borderRadius: '4px' },
  nodeLatency: { fontSize: '9px', fontWeight: 700, fontFamily: '"Orbitron", monospace', marginTop: 1 },
  nodeName: {
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '0.2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '90px'
  },
  nodeStatusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(0,0,0,0.5)',
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.1)'
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    animation: 'pulseGlow 2s infinite'
  },
  nodeBody: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    position: 'relative'
  },
  nodeDataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '10px',
    borderBottom: '1px dotted rgba(255,255,255,0.1)'
  },
  dataLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    letterSpacing: '2px'
  },
  dataValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-sub)',
    fontFamily: '"Orbitron", monospace',
    textAlign: 'right'
  },
  nodeFooterBar: {
    height: '4px',
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0
  },
  skeleton: {
    height: '180px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(0, 163, 255, 0.1)',
    animation: 'pulseGlow 2s infinite',
    clipPath: 'polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px))'
  }
}

