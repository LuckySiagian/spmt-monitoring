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
      position: 'fixed', top: rect.bottom + 8, right: window.innerWidth - rect.right, width: 280,
      background: 'var(--bg-card)', backdropFilter: 'blur(24px)', border: '1px solid var(--border)',
      borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', zIndex: 99995, overflow: 'hidden', animation: 'fadeIn 0.15s ease'
    }}>

      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--accent-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatar ? 'transparent' : `linear-gradient(135deg,${rc}22,${rc}44)`, border: `2px solid ${rc}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: rc, overflow: 'hidden' }}>
            {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (user?.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: rc, fontWeight: 700, letterSpacing: '0.05em' }}>{rl.toUpperCase()}</div>
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
                style={{ width: 24, height: 24, borderRadius: '50%', background: t.color, border: themeId === t.id ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>DARK MODE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {darkThemes.map(t => (
              <button key={t.id} onClick={() => setTheme(t.id)} title={t.name}
                style={{ width: 24, height: 24, borderRadius: '50%', background: t.color, border: themeId === t.id ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
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
    { label: t?.online || 'ONLINE', value: summary?.online_count ?? 0, color: 'var(--online)' },
    { label: t?.critical || 'CRITICAL', value: summary?.critical_count ?? 0, color: 'var(--critical)' },
    { label: t?.offline || 'OFFLINE', value: summary?.offline_count ?? 0, color: 'var(--offline)' },
    { label: t?.unknown || 'UNKNOWN', value: summary?.unknown_count ?? 0, color: 'var(--text-muted)' },
    { label: 'SLA', value: `${fmtSLA(summary?.sla_percent)}%`, color: 'var(--accent)' },
    { label: t?.total || 'TOTAL', value: summary?.total_websites ?? 0, color: 'var(--text-sub)' },
    { label: 'AVG RT', value: `${Math.round(summary?.avg_response_time ?? 0)}ms`, color: '#7c3aed' },
    { label: t?.alerts || 'ALERTS', value: alertCount, color: alertCount > 0 ? 'var(--offline)' : 'var(--text-muted)' },
  ]

  const slaPct = Number(summary?.sla_percent || 100);

  const rc = { superadmin: '#8b5cf6', admin: '#3b82f6', viewer: '#64748b' }[user?.role] || '#64748b'
  const rl = { superadmin: 'SA', admin: 'AD', viewer: 'VW' }[user?.role] || '??'
  const navLabel = tab => {
    if (tab === 'dashboard') return `📊 ${t?.dashboard || 'Dashboard'}`
    if (tab === 'websites') return `🌐 ${t?.websites || 'Websites'}`
    if (tab === 'activity-log') return `📋 ${t?.activity || 'Activity'}`
    if (tab === 'notifications') return `🔔 ${t?.notifications || 'Notifications'}`
    if (tab === 'users') return `👥 ${t?.users || 'Users'}`
    return tab
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        height: '74px', padding: '0 24px',
        background: 'var(--bg-header)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        position: 'relative', zIndex: 100
      }}>

        {/* ── BRANDING SECTION (COMPACT & CLAMPED) ── */}
        <div className="topbar-branding" style={{ display: 'flex', alignItems: 'center', height: '100%', flexShrink: 0 }}>
          {/* Logo Part - CLAMPED LEFT */}
          <div style={{
            height: '100%', padding: '0 8px 0 0', /* Extreme left */
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{
              background: '#FFFFFF', padding: '4px 12px', borderRadius: '0 10px 10px 0',
              boxShadow: '2px 0 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <img src="/images/logos/logo spmt fc.png" alt="SPMT"
                style={{ height: 60, width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
            </div>
          </div>

          {/* Text Part (Compact) */}
          <div style={{
            padding: '0 8px', display: 'flex', flexDirection: 'column',
            justifyContent: 'center', height: '100%'
          }}>
            <span style={{
              fontSize: 18, fontWeight: 1000, color: 'var(--text)', /* Smaller as requested */
              letterSpacing: '-0.02em', background: 'linear-gradient(to right, var(--accent), #3b82f6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 0.9
            }}>SPMT</span>
            <span style={{
              fontSize: 9, fontWeight: 800, color: 'var(--text-muted)',
              letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 1
            }}>MONITORING</span>
          </div>
        </div>

        {/* ── METRICS SECTION (Flexible To Avoid Overlap) ── */}
        <div className="topbar-metrics" style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 10px', visibility: activeNav === 'dashboard' ? 'visible' : 'hidden',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', gap: 4, width: 'auto', justifyContent: 'center', alignItems: 'center' }}>
            {metrics.map(m => {
              const active = activeMetric === m.label
              const isAlert = (m.label === 'ALERTS' || m.label === t?.alerts) && m.value > 0

              return (
                <div key={m.label} title={`Detail ${m.label}`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '4px 8px', borderRadius: 8, cursor: 'pointer', userSelect: 'none',
                    flex: '0 1 auto', minWidth: 65, maxWidth: 100,
                    background: active ? `linear-gradient(180deg, transparent, ${m.color}20)` : 'var(--accent-light)',
                    border: `1px solid ${active ? m.color : 'var(--border)'}`,
                    borderBottom: `2.5px solid ${active ? m.color : m.color + '40'}`,
                    transition: 'all 0.2s ease', position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
                    e.currentTarget.style.zIndex = 10;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.zIndex = 1;
                  }}
                  onClick={() => setActiveMetric(active ? null : m.label)}>

                  {isAlert && <span style={{ position: 'absolute', top: 1, right: 2, width: 4, height: 4, borderRadius: '50%', background: 'var(--offline)', animation: 'pulse 1s infinite' }} />}

                  <div style={{ color: m.color, fontSize: 14, fontWeight: 1000, fontFamily: 'monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>{m.value}</div>
                  <div style={{ fontSize: 8, color: m.color, letterSpacing: '0.01em', marginTop: 2, fontWeight: 900, opacity: 1, whiteSpace: 'nowrap' }}>{m.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── NAVIGATION SECTION (Enlarged Boxes) ── */}
        <div className="topbar-nav" style={{
          display: 'flex', gap: 4, background: 'var(--accent-light)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 2, height: 36, flexShrink: 0
        }}>
          {navItems.map(tab => {
            const labelStr = navLabel(tab).split(' ')[1] || navLabel(tab) // Remove emoji for space
            return (
              <button key={tab}
                style={{
                  background: activeNav === tab ? 'var(--bg-card)' : 'transparent',
                  border: activeNav === tab ? '1px solid var(--border)' : '1px solid transparent',
                  color: activeNav === tab ? 'var(--accent)' : 'var(--text-sub)',
                  fontSize: 10, fontWeight: 800, padding: '0 12px', borderRadius: 6,
                  cursor: 'pointer', height: '100%', whiteSpace: 'nowrap', boxShadow: activeNav === tab ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
                onClick={() => onNavChange(tab)}>{labelStr}</button>
            )
          })}
        </div>

        {/* Mini SLA Donut for TV Mode Highlight */}
        {isTvMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
            <svg width="28" height="28" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={slaPct > 99 ? '#10b981' : slaPct > 80 ? '#f59e0b' : '#ef4444'} strokeWidth="4"
                strokeDasharray="88" strokeDashoffset={88 - (slaPct / 100) * 88} strokeLinecap="round" transform="rotate(-90 18 18)" style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{slaPct.toFixed(2)}%</span>
              <span style={{ fontSize: 8, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em' }}>SLA 24H</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={onToggleTvMode} className="hover-glow" title="Full/Mini Screen"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 12px', height: 36, borderRadius: 8, background: isTvMode ? 'rgba(99,102,241,0.2)' : 'transparent', border: isTvMode ? '1px solid var(--accent)' : '1px solid transparent', color: isTvMode ? 'var(--accent)' : 'var(--text-sub)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
              <polyline points="17 2 12 7 7 2"></polyline>
            </svg>
            {!isTvMode && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>Full</span>}
          </button>

          <NotificationBell notifications={notifications} onMarkRead={onMarkRead} onMarkAllRead={onMarkAllRead} onNavigate={onNavigate} />

          <div style={{ flexShrink: 0, padding: '0 16px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.08em', textShadow: '0 0 8px rgba(255,255,255,0.2)' }}>
              {clock.toLocaleTimeString('id-ID', { hour12: false })}
            </div>
          </div>

          {/* Profile avatar */}
          <div ref={profileRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => { setShowProfile(v => !v); if (profileRef.current) setProfileRect(profileRef.current.getBoundingClientRect()) }}
              className="hover-glow"
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-light)', border: `1px solid var(--border)`, borderRadius: 20, padding: '4px 12px 4px 4px', cursor: 'pointer' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatar ? 'transparent' : `linear-gradient(135deg,${rc}22,${rc}44)`, border: `2px solid ${rc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: rc, flexShrink: 0, textShadow: `0 0 5px ${rc}`, overflow: 'hidden' }}>
                {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (user?.username || '?')[0].toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                <span style={{ color: 'var(--text)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.username}</span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>▾</span>
            </button>
            {showProfile && <ProfileDropdown user={user} avatar={avatar} rect={profileRect} onProfile={onProfile} onLogout={onLogout} onSettings={onSettings} onAbout={onAbout} onClose={() => setShowProfile(false)} />}
          </div>
        </div>
      </div>

      {activeMetric && <MetricDetailModal type={activeMetric} websites={websites} summary={summary} onClose={() => setActiveMetric(null)} />}
    </>
  )
}
