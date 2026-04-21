import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { AuthProvider, useAuth } from './store/auth'
import { ThemeProvider, useTheme } from './store/theme'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import WebsitesPage from './pages/WebsitesPage'
import UsersPage from './pages/UsersPage'
import ActivityLogPage from './pages/ActivityLogPage'
import TopBar from './components/dashboard/TopBar'
import ToastContainer, { showToast } from './components/dashboard/Toast'
import { dashboardAPI, websiteAPI, userAPI, eventsAPI } from './services/api'
import PublicStatusPage from './pages/PublicStatusPage'

// ── All Notifications Full Panel (rendered in portal, triggered by bell "View All")
function AllNotificationsPanel({ notifications, onDelete, onClearAll, onClose }) {
  const SC = { ONLINE: '#059669', CRITICAL: '#d97706', OFFLINE: '#dc2626', UNKNOWN: '#64748b' }
  const fmtTime = d => d ? new Date(d).toLocaleString('id-ID', { hour12: false }) : '—'

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99998, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: 76 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 'min(540px,95vw)', height: 'calc(100vh - 86px)', marginRight: 12,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14,
        boxShadow: '0 16px 48px rgba(99,102,241,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.2s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(99,102,241,0.1)', background: 'rgba(255,255,255,0.95)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>🔔 All Notifications</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Status change events this session ({notifications.length})</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {notifications.length > 0 && <button onClick={onClearAll} style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Clear All</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>✕</button>
          </div>
        </div>
        {notifications.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>🔔</div>
            <div style={{ fontSize: 13 }}>No notifications this session</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(99,102,241,0.07)', background: !n.read ? 'rgba(79,70,229,0.04)' : 'transparent', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = !n.read ? 'rgba(79,70,229,0.04)' : 'transparent'}>
                {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', flexShrink: 0, marginTop: 5 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{n.name}</span>
                    <span style={{ background: (SC[n.type] || '#64748b') + '18', color: SC[n.type] || '#64748b', border: `1px solid ${SC[n.type] || '#64748b'}33`, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{n.type}</span>
                  </div>
                  {n.reason && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{n.reason}</div>}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(n.ts)}</div>
                </div>
                <button onClick={() => onDelete?.(i)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Settings Modal ──────────────────────────────────────────────
function SettingsModal({ onClose }) {
  const { lang, setLanguage, LANGUAGES, themeId, setTheme, THEME_OPTIONS } = useTheme()
  const [sound, setSound] = useState(() => localStorage.getItem('spmt_sound') !== 'off')
  // We'll track the selected theme locally before saving so it can be previewed or just applied immediately
  const handleThemeChange = (id) => {
    setTheme(id)
  }

  const save = () => {
    localStorage.setItem('spmt_sound', sound ? 'on' : 'off')
    window.location.reload()
  }
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', borderRadius: 14, width: 440, maxWidth: '94vw', boxShadow: 'var(--shadow-glow)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-header)', borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>⚙️ System Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', maxHeight: '65vh', overflowY: 'auto' }}>
          
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 16 }}>🎨 SCI-FI THEME SELECTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
            {THEME_OPTIONS.map(theme => (
              <div 
                key={theme.id}
                onClick={() => handleThemeChange(theme.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
                  background: themeId === theme.id ? 'var(--accent-light)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${themeId === theme.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: themeId === theme.id ? `0 0 10px ${theme.color}20 inset` : 'none'
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: theme.color, boxShadow: `0 0 8px ${theme.color}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: themeId === theme.id ? 'var(--text)' : 'var(--text-sub)' }}>{theme.name}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 10 }}>⚙️ MONITORING PREFERENCES</div>
          {[
            { l: '🔔 Notification Sound', s: sound, set: setSound },
            { l: '📡 Intensive Network Scan', s: localStorage.getItem('spmt_scan') === 'on', set: (v) => localStorage.setItem('spmt_scan', v ? 'on' : 'off') },
            { l: '🎯 Auto-Acknowledge Resolved Alerts', s: localStorage.getItem('spmt_autoack') === 'on', set: (v) => localStorage.setItem('spmt_autoack', v ? 'on' : 'off') },
            { l: '📊 Detailed Metrics Tooltips', s: localStorage.getItem('spmt_tooltips') !== 'off', set: (v) => localStorage.setItem('spmt_tooltips', v ? 'on' : 'off') },
            { l: '🔄 Real-time Topology Sync', s: localStorage.getItem('spmt_topo_sync') !== 'off', set: (v) => localStorage.setItem('spmt_topo_sync', v ? 'on' : 'off') },
          ].map(item => (
            <div key={item.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.l}</span>
              <button
                onClick={() => {
                  if (typeof item.set === 'function' && item.set.length === 1) {
                    item.set(!item.s);
                  } else {
                    item.set(v => !v);
                  }
                }}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', background: item.s ? 'var(--accent)' : 'rgba(0,0,0,0.3)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                <span style={{ position: 'absolute', top: 2, left: item.s ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-header)', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-sub)', borderRadius: 7, padding: '7px 18px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={save} style={{ background: 'var(--accent)', border: 'none', color: '#000', borderRadius: 7, padding: '7px 20px', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 0 15px var(--accent-light)' }}>Save & Apply</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── About Modal ─────────────────────────────────────────────────
function AboutModal({ onClose }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, width: 500, maxWidth: '94vw', boxShadow: '0 16px 48px rgba(99,102,241,0.2)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>ℹ️ About SPMT Monitoring</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, padding: '14px', background: 'rgba(79,70,229,0.06)', borderRadius: 10, border: '1px solid rgba(79,70,229,0.1)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(79,70,229,0.12)', border: '1px solid rgba(79,70,229,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📡</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>SPMT Monitoring System</div>
              <div style={{ fontSize: 12, color: '#4f46e5', marginTop: 2 }}>NOC Control Panel · Pelindo Multi Terminal</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>v2.0.0 · 2026</div>
            </div>
          </div>
          {[
            ['🎯 Tujuan', 'Memantau ketersediaan dan kinerja seluruh website & layanan digital Pelindo Multi Terminal secara real-time 24/7.'],
            ['🔍 Cara Kerja', 'Backend Go melakukan pengecekan HTTP/DNS/ICMP/TCP setiap 10 detik per website. Hasilnya dikirim via WebSocket sehingga tampil instan tanpa perlu refresh.'],
            ['🛡️ Keamanan', 'JWT Token + role-based access: SuperAdmin (akses penuh), Admin (kelola website), Viewer (hanya baca).'],
            ['📊 Fitur', 'Network Topology real-time · Monitoring Graph historis · Activity Log · Notifikasi otomatis · User Management.'],
          ].map(([t, d]) => (
            <div key={t} style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.04)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.1)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Logout Confirm ──────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '32px', width: 320, textAlign: 'center', boxShadow: '0 16px 48px rgba(99,102,241,0.2)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🚪</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Logout?</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Are you sure you want to logout?</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--text-sub)', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', color: 'var(--text)', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Logout</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Profile Modal ───────────────────────────────────────────────
function ProfileModal({ user, onClose }) {
  const [avatar, setAvatar] = useState(() => localStorage.getItem(`spmt_avatar_${user?.username}`) || null)

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target.result
      setAvatar(base64)
      localStorage.setItem(`spmt_avatar_${user?.username}`, base64)
      // Custom event to force TopBar re-render if needed
      window.dispatchEvent(new Event('AvatarUpdated'))
    }
    reader.readAsDataURL(file)
  }

  const handleRemove = () => {
    setAvatar(null)
    localStorage.removeItem(`spmt_avatar_${user?.username}`)
    window.dispatchEvent(new Event('AvatarUpdated'))
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', borderRadius: 14, width: 440, maxWidth: '94vw', boxShadow: 'var(--shadow)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>👤 Customization & Profile</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ position: 'relative', width: 72, height: 72, borderRadius: '50%', border: '2px solid var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
              {avatar ? <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                <div style={{ width: '100%', height: '100%', background: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>
                  {(user?.username || '?')[0].toUpperCase()}
                </div>
              }
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{user?.username}</div>
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>Role: {user?.role.toUpperCase()}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ background: 'var(--accent)', color: '#fff', padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  Upload Photo <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
                </label>
                {avatar && <button onClick={handleRemove} style={{ background: 'transparent', border: '1px solid var(--offline)', color: 'var(--offline)', padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>Remove</button>}
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(99,102,241,0.05)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text)' }}>Employee Details</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Email</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{user?.username}@pelindo.co.id</div></div>
              <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Department</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>IT / NOC Operasional</div></div>
              <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Status</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--online)' }}>Active</div></div>
              <div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Location</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Pelabuhan Belawan</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function getInitialNav() {
  const saved = localStorage.getItem('spmt_active_nav')
  return ['dashboard', 'websites', 'activity-log', 'users'].includes(saved) ? saved : 'dashboard'
}

function AppInner() {
  const { user, isSuperAdmin, logout } = useAuth()
  const { themeId } = useTheme()
  const [loggedIn, setLoggedIn] = useState(!!user)
  const [activeNav, setActiveNav] = useState(getInitialNav)
  const [summary, setSummary] = useState(null)
  const [websites, setWebsites] = useState([])
  const [users, setUsers] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showLogout, setShowLogout] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAllNotifs, setShowAllNotifs] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [isTvMode, setTvMode] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0)

  const websitesRef = useRef(websites)
  useEffect(() => { websitesRef.current = websites }, [websites])

  const [isAuthView, setIsAuthView] = useState(() => localStorage.getItem('spmt_auth_mode') === 'true')

  const toggleAuthView = (show) => {
    setIsAuthView(show)
    localStorage.setItem('spmt_auth_mode', show ? 'true' : 'false')
  }

  useEffect(() => {
    const h = () => { 
      setLoggedIn(false); 
      toggleAuthView(false); // Reset to public view on logout
      setSummary(null); 
      setWebsites([]); 
      setNotifications([]);
    }
    window.addEventListener('auth:logout', h)
    return () => window.removeEventListener('auth:logout', h)
  }, [])

  useEffect(() => {
    const fn = () => {
      if (!document.fullscreenElement) {
        document.body.classList.remove('tv-mode')
        setTvMode(false)
      }
    }
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  const toggleTvMode = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { })
      document.body.classList.add('tv-mode')
      setTvMode(true)
    } else {
      document.exitFullscreen().catch(() => { })
      document.body.classList.remove('tv-mode')
      setTvMode(false)
    }
  }, [])

  const playAlarm = useCallback(() => {
    if (localStorage.getItem('spmt_sound') === 'off') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Ping 1
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(880, ctx.currentTime);
      o1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      g1.gain.setValueAtTime(0.2, ctx.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      o1.connect(g1); g1.connect(ctx.destination);
      o1.start(); o1.stop(ctx.currentTime + 0.3);

      // Ping 2
      setTimeout(() => {
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(880, ctx.currentTime);
        o2.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        g2.gain.setValueAtTime(0.2, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        o2.connect(g2); g2.connect(ctx.destination);
        o2.start(); o2.stop(ctx.currentTime + 0.3);
      }, 150);

    } catch (e) { }
  }, [])

  const loadSummary = useCallback(async (signal) => { 
    if (!loggedIn) return; 
    try { 
      const r = await dashboardAPI.getSummary({ signal }); 
      setSummary(r.data) 
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
    } 
  }, [loggedIn])

  const loadWebsites = useCallback(async (signal) => {
    if (!loggedIn) return;
    try {
      const r = await websiteAPI.getAll({ signal });
      setWebsites(r.data || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
    }
  }, [loggedIn])

  const loadUsers = useCallback(async () => {
    if (!loggedIn || !isSuperAdmin) return;
    try {
      const r = await userAPI.getAll();
      setUsers(r.data || []);
    } catch (e) { }
  }, [loggedIn, isSuperAdmin])

  const loadEvents = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const r = await eventsAPI.getAll(500);
      setAllEvents(r.data || []);
    } catch (e) { }
  }, [loggedIn])

  const triggerGlobalRefresh = useCallback(() => {
    setGlobalRefreshKey(k => k + 1)
  }, [])

  const handleWebsiteUpdate = useCallback(() => { 
    loadSummary(); 
    loadWebsites(); 
    loadEvents();
    triggerGlobalRefresh();
    setRefreshTrigger(t => t + 1) 
  }, [loadSummary, loadWebsites, loadEvents, triggerGlobalRefresh])

  const handleUserUpdate = useCallback(() => {
    loadUsers();
    triggerGlobalRefresh();
  }, [loadUsers, triggerGlobalRefresh])

  useEffect(() => { 
    if (!loggedIn) return;
    const controller = new AbortController();
    loadSummary(controller.signal); 
    loadWebsites(controller.signal);
    loadUsers();
    loadEvents();
    
    const ivSummary = setInterval(() => loadSummary(controller.signal), 2000); 
    const ivWebsites = setInterval(() => loadWebsites(controller.signal), 30000); 
    const ivUsersEvents = setInterval(() => { loadUsers(); loadEvents(); }, 60000); // 1m fallback
    
    return () => {
      controller.abort();
      clearInterval(ivSummary);
      clearInterval(ivWebsites);
      clearInterval(ivUsersEvents);
    }
  }, [loggedIn, loadSummary, loadWebsites, loadUsers, loadEvents])

  const navTo = useCallback((nav) => { if (nav === 'users' && !isSuperAdmin) return; setActiveNav(nav); localStorage.setItem('spmt_active_nav', nav) }, [isSuperAdmin])

  const handleNewNotification = useCallback((notif) => {
    if (notif.type !== 'OFFLINE' && notif.type !== 'CRITICAL') return
    setNotifications(prev => {
      const dupe = prev.find(n => n.websiteId === notif.websiteId && n.type === notif.type && (Date.now() - n.ts) < 300000);
      if (dupe) return prev;
      playAlarm(); // TRIGGER SCI-FI ALARM ON NEW ALERT
      return [{ ...notif, read: false }, ...prev].slice(0, 200)
    })
  }, [playAlarm])

  const handleMarkRead = useCallback((idx) => setNotifications(p => p.map((n, i) => i === idx ? { ...n, read: true } : n)), [])
  const handleMarkAllRead = useCallback(() => setNotifications(p => p.map(n => ({ ...n, read: true }))), [])
  const handleDelete = useCallback((idx) => setNotifications(p => p.filter((_, i) => i !== idx)), [])
  const handleClearAll = useCallback(() => setNotifications([]), [])
  const handleLogout = () => { 
    setShowLogout(false); 
    logout(); 
    setLoggedIn(false); 
    localStorage.removeItem('spmt_active_nav');
    window.location.reload(); // Force full refresh for clean public state
  }

  if (!loggedIn) {
    if (isAuthView) {
      return (
        <LoginPage 
          onLogin={() => {
            setLoggedIn(true)
            toggleAuthView(false)
            showToast('Login berhasil! Selamat datang, ' + (user?.username || 'User'), 'success')
          }} 
          onBack={() => toggleAuthView(false)}
        />
      )
    }
    return <PublicStatusPage onLoginClick={() => toggleAuthView(true)} />
  }

  const navItems = ['dashboard', 'websites', 'activity-log', ...(isSuperAdmin ? ['users'] : [])]

  const realtimeSnapshot = {
    online: websites.filter(w => w.status === 'ONLINE').length,
    critical: websites.filter(w => w.status === 'CRITICAL').length,
    offline: websites.filter(w => w.status === 'OFFLINE').length,
    unknown: websites.filter(w => !w.status || w.status === 'UNKNOWN').length
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-main)', color: 'var(--text)', position: 'relative' }}>
      
      {/* Sci-Fi Ambient Glows (Light Mode) */}
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none', opacity: 0.5 }} />
      <div style={{ position: 'absolute', bottom: '-5%', right: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none', opacity: 0.5 }} />

      <TopBar
        summary={summary} activeNav={activeNav} onNavChange={navTo}
        websites={websites} notifications={notifications}
        onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead}
        onNavigate={(nav) => { if (nav === 'notifications') setShowAllNotifs(true); else navTo(nav) }}
        navItems={navItems}
        isTvMode={isTvMode} onToggleTvMode={toggleTvMode}
        onProfile={() => setShowProfile(true)}
        onLogout={() => setShowLogout(true)}
        onSettings={() => setShowSettings(true)}
        onAbout={() => setShowAbout(true)}
      />
      <div className="page-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, zIndex: 1, position: 'relative' }}>
        {activeNav === 'dashboard' && <DashboardPage onSummaryUpdate={setSummary} websites={websites} onWebsitesUpdate={setWebsites} onNewNotification={handleNewNotification} refreshTrigger={refreshTrigger} realtimeSnapshot={realtimeSnapshot} wsConnected={wsConnected} setWsConnected={setWsConnected} />}
        {activeNav === 'websites' && <WebsitesPage websites={websites} onWebsiteUpdate={handleWebsiteUpdate} />}
        {activeNav === 'activity-log' && <ActivityLogPage events={allEvents} />}
        {activeNav === 'users' && isSuperAdmin && <UsersPage users={users} onUserUpdate={handleUserUpdate} />}
      </div>

      {showAllNotifs && <AllNotificationsPanel notifications={notifications} onDelete={handleDelete} onClearAll={handleClearAll} onClose={() => setShowAllNotifs(false)} />}
      {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} />}
      {showLogout && <LogoutModal onConfirm={handleLogout} onCancel={() => setShowLogout(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}

export default function App() { return <ThemeProvider><AuthProvider><AppInner /><ToastContainer /></AuthProvider></ThemeProvider> }
