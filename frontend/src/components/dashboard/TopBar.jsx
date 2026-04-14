import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../store/auth'
import { useTheme } from '../../store/theme'
import NotificationBell from './NotificationBell'
import MetricDetailModal from './MetricDetailModal'

const fmtSLA = v => v == null ? '0.00' : Number(v).toFixed(2)
const DROPDOWN_ID = 'profile-dd'

function ProfileDropdown({ user, avatar, onProfile, onLogout, onSettings, onAbout, onClose, rect }) {
  if (!rect) return null
  const { themeId, setTheme, THEME_OPTIONS } = useTheme()
  const rc = { superadmin: '#7c3aed', admin: '#3b82f6', viewer: '#64748b' }[user?.role] || '#64748b'
  const rl = { superadmin: 'SuperAdmin', admin: 'Admin', viewer: 'Viewer' }[user?.role] || 'User'

  const lightThemes = THEME_OPTIONS.filter(t => t.dark === false)
  const darkThemes = THEME_OPTIONS.filter(t => t.dark === true)

  return createPortal(
    <div id={DROPDOWN_ID} style={{
      position: 'fixed', top: rect.bottom + 8, right: window.innerWidth - rect.right, width: 260,
      background: 'var(--bg-card)', backdropFilter: 'blur(24px)', border: '1px solid var(--border)',
      borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', zIndex: 99995, overflow: 'hidden', animation: 'fadeIn 0.15s ease'
    }}>

      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--accent-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: avatar ? 'transparent' : `linear-gradient(135deg,${rc}22,${rc}44)`, border: `2px solid ${rc}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: rc, overflow: 'hidden' }}>
            {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (user?.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: rc, fontWeight: 600, letterSpacing: '0.05em' }}>{rl.toUpperCase()}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.1em' }}>SELECT THEME</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>LIGHT MODE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {lightThemes.map(t => (
              <button key={t.id} onClick={() => setTheme(t.id)} title={t.name}
                style={{ width: 20, height: 20, borderRadius: '50%', background: t.color, border: themeId === t.id ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>DARK MODE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {darkThemes.map(t => (
              <button key={t.id} onClick={() => setTheme(t.id)} title={t.name}
                style={{ width: 20, height: 20, borderRadius: '50%', background: t.color, border: themeId === t.id ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '4px' }}>
        {[{ icon: '👤', label: 'Profile', action: onProfile }, { icon: '⚙️', label: 'Settings', action: onSettings }, { icon: 'ℹ️', label: 'About', action: onAbout }].map(item => (
          <button key={item.label} onClick={() => { item.action(); onClose() }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontSize: 14, fontWeight: 600, borderRadius: 8, transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
        <button onClick={() => { onLogout(); onClose() }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--offline)', fontSize: 14, fontWeight: 700, borderRadius: 8, transition: 'all 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 16 }}>🚪</span>Logout
        </button>
      </div>
    </div>,
    document.body
  )
}

export default function TopBar({ summary, onNavChange, activeNav, websites = [], notifications = [], onMarkRead, onMarkAllRead, navItems = ['dashboard', 'websites', 'activity-log'], onNavigate, onLogout, onSettings, onAbout, onProfile, isTvMode, onToggleTvMode }) {
  const { user } = useAuth()
  const { t } = useTheme()
  const [activeMetric, setActiveMetric] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [showProfile, setShowProfile] = useState(false)
  const [profileRect, setProfileRect] = useState(null)
  const [avatar, setAvatar] = useState(() => localStorage.getItem(`spmt_avatar_${user?.username}`) || null)
  const profileRef = useRef(null)

  useEffect(() => {
    const h = () => setAvatar(localStorage.getItem(`spmt_avatar_${user?.username}`) || null)
    window.addEventListener('AvatarUpdated', h)
    return () => window.removeEventListener('AvatarUpdated', h)
  }, [user?.username])

  useEffect(() => { const iv = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(iv) }, [])
  useEffect(() => {
    const h = (e) => {
      if (profileRef.current && profileRef.current.contains(e.target)) return
      const dd = document.getElementById(DROPDOWN_ID)
      if (dd && dd.contains(e.target)) return
      setShowProfile(false)
    }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const alertCount = summary?.active_alerts ?? 0
  const metrics = [
    { label: t?.online || 'ONLINE', value: summary?.online_count ?? 0, color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981' },
    { label: t?.critical || 'CRITICAL', value: summary?.critical_count ?? 0, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b' },
    { label: t?.offline || 'OFFLINE', value: summary?.offline_count ?? 0, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444' },
    { label: t?.unknown || 'UNKNOWN', value: summary?.unknown_count ?? 0, color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.15)', borderColor: '#64748b' },
    { label: 'SLA', value: `${fmtSLA(summary?.sla_percent)}%`, color: '#2563eb', bgColor: 'rgba(37, 99, 235, 0.15)', borderColor: '#2563eb' },
    { label: t?.total || 'TOTAL', value: summary?.total_websites ?? 0, color: '#7c3aed', bgColor: 'rgba(124, 58, 237, 0.15)', borderColor: '#7c3aed' },
    { label: 'AVG RT', value: `${Math.round(summary?.avg_response_time ?? 0)}ms`, color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.15)', borderColor: '#ec4899' },
    { label: t?.alerts || 'ALERTS', value: alertCount, color: alertCount > 0 ? '#dc2626' : '#64748b', bgColor: alertCount > 0 ? 'rgba(220, 38, 38, 0.15)' : 'rgba(100, 116, 139, 0.15)', borderColor: alertCount > 0 ? '#dc2626' : '#64748b' },
  ]

  const rc = { superadmin: '#8b5cf6', admin: '#3b82f6', viewer: '#64748b' }[user?.role] || '#64748b'
  const navLabel = tab => {
    if (tab === 'dashboard') return `📊 Dashboard`
    if (tab === 'websites') return `🌐 Websites`
    if (tab === 'activity-log') return `📋 Activity`
    if (tab === 'notifications') return `🔔 Notifications`
    if (tab === 'users') return `👥 Users`
    return tab
  }

  return (
    <header className="topbar-wrapper" style={{ flexShrink: 0 }}>
      {/* ── TOPBAR CONTENT ── */}
      <div className="topbar">

        {/* ── BRANDING SECTION (LOGO MASTERPIECE) ── */}
        <div className="topbar-branding" style={{ flexShrink: 0 }}>
          <img src="/images/logos/logo-link-monitor.png" alt="SPMT LINK MONITOR"
            style={{
              height: 75,
              width: 120,
              objectFit: 'contain',
              objectPosition: 'center center',
              borderRadius: 30,
              filter: 'drop-shadow(0 0 10px rgba(99,102,241,0.3))'
            }}
            onError={(e) => { e.target.style.display = 'none'; }} />
        </div>


        {/* ── METRICS SECTION (Single-Row 8-Metric HUD) ── */}
        <div className="topbar-metrics" style={{ visibility: activeNav === 'dashboard' ? 'visible' : 'hidden' }}>
          {metrics.map(m => {
            const active = activeMetric === m.label
            const isAlert = (m.label === 'ALERTS' || m.label === t?.alerts) && m.value > 0
            const statusClass = m.label === 'ONLINE' ? 'online' : (m.label === 'CRITICAL' ? 'critical' : (m.label === 'OFFLINE' ? 'offline' : ''))
            return (
              <div key={m.label} title={`Detail ${m.label}`} className={`metric-card ${statusClass}`} style={{ 
                cursor: 'pointer', 
                userSelect: 'none', 
                background: active ? `${m.color}22` : m.bgColor, 
                borderColor: active ? m.color : m.borderColor,
                boxShadow: active ? `0 0 15px ${m.color}40` : `0 0 8px ${m.borderColor}20`
              }} onClick={() => setActiveMetric(active ? null : m.label)}>
                {isAlert && <span style={{ position: 'absolute', top: 1, right: 2, width: 4, height: 4, borderRadius: '50%', background: 'var(--offline)', animation: 'pulse 1s infinite' }} />}
                <span style={{ color: m.color, fontSize: 22, fontWeight: 1000 }}>{m.value}</span>
                <span className="metric-label">{m.label}</span>
              </div>
            )
          })}
        </div>

        <div className="topbar-nav-container">
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {navItems.map(tab => {
              const labelText = navLabel(tab)
              const [icon, ...textParts] = labelText.split(' ')
              const title = textParts.join(' ')
              const isActive = activeNav === tab
              return (
                <div key={tab} className="nav-icon-container" onClick={() => onNavChange(tab)} title={title} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <button className={`nav-icon-btn ${isActive ? 'active' : ''}`}>
                    <span style={{ fontSize: 28 }}>{icon}</span>
                  </button>
                  <span className="nav-icon-label">{title}</span>
                  <div className="nav-overlay-text">{title}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="topbar-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onToggleTvMode} className="hover-glow" title="Full/Minimize Screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', height: 36, borderRadius: 8, background: isTvMode ? 'rgba(34,211,238,0.1)' : 'transparent', border: 'none', color: isTvMode ? 'var(--accent)' : 'var(--text-sub)' }}>
            <span className="material-symbols-rounded" style={{ fontSize: 40 }}>{isTvMode ? '📤' : '📺'}</span>
          </button>

          <NotificationBell notifications={notifications} onMarkRead={onMarkRead} onMarkAllRead={onMarkAllRead} onNavigate={onNavigate} />

          <div className="topbar-time" style={{ color: 'var(--text)', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', padding: '2px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, whiteSpace: 'nowrap' }}>
            {clock.toLocaleTimeString('id-ID', { hour12: false })}
          </div>

          <div ref={profileRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => { setShowProfile(v => !v); if (profileRef.current) setProfileRect(profileRef.current.getBoundingClientRect()) }} className="hover-glow" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 25, background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s', minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatar ? 'transparent' : `linear-gradient(135deg,${rc}22,${rc}44)`, border: `2px solid ${rc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: rc, flexShrink: 0, overflow: 'hidden' }}>
                {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (user?.username || '?')[0].toUpperCase()}
              </div>
              <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.username}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>▾</span>
            </button>
            {showProfile && <ProfileDropdown user={user} avatar={avatar} rect={profileRect} onProfile={onProfile} onLogout={onLogout} onSettings={onSettings} onAbout={onAbout} onClose={() => setShowProfile(false)} />}
          </div>
        </div>
      </div>
      {activeMetric && <MetricDetailModal type={activeMetric} websites={websites} summary={summary} onClose={() => setActiveMetric(null)} />}
    </header>
  )
}
