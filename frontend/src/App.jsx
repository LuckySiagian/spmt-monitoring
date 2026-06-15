import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AuthProvider, useAuth } from './store/auth'
import { ThemeProvider, useTheme } from './store/theme'
import { WebSocketProvider } from './store/WebSocketContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import WebsitesPage from './pages/WebsitesPage'
import UsersPage from './pages/UsersPage'
import ActivityLogPage from './pages/ActivityLogPage'
import TopBar from './components/dashboard/TopBar'
import ServiceDetailModal from './components/dashboard/ServiceDetailModal'
import ServerDetailModal from './components/dashboard/ServerDetailModal'
import ToastContainer, { showToast } from './components/dashboard/Toast'
import { dashboardAPI, websiteAPI, userAPI, eventsAPI, authAPI } from './services/api'
import { cleanReason } from './utils/rootCause'

// ── All Notifications Full Panel (rendered in portal, triggered by bell "View All")
const LOCALE_MAP = { id: 'id-ID', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU' }

function AllNotificationsPanel({ notifications, onDelete, onClearAll, onClose, onOpen }) {
  const { t, lang } = useTheme()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const SC = { ONLINE: '#10b981', WARNING: '#f59e0b', DEGRADED: '#f97316', CRITICAL: '#ef4444', OFFLINE: '#dc2626', UNKNOWN: '#94a3b8' }
  const fmtTime = d => d ? new Date(d).toLocaleString(locale, { hour12: false }) : '—'

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99998, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: 76 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 'min(540px,95vw)', height: 'calc(100vh - 86px)', marginRight: 12,
        background: 'var(--bg-card)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border-strong)', borderRadius: 14,
        boxShadow: '0 16px 48px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.2s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>🔔 {t.allNotifications}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.statusChangeEventsSession} ({notifications.length})</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {notifications.length > 0 && <button onClick={onClearAll} style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t.clearAll}</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>✕</button>
          </div>
        </div>
        {notifications.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>🔔</div>
            <div style={{ fontSize: 13 }}>{t.noNotifSession}</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.map((n, i) => {
              const msg = cleanReason(n.reason)
              const clickable = !!(onOpen && n.websiteId)
              return (
                <div key={i}
                  onClick={clickable ? () => onOpen(n) : undefined}
                  title={clickable ? 'Buka detail layanan' : undefined}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(99,102,241,0.07)', background: !n.read ? 'rgba(79,70,229,0.04)' : 'transparent', transition: 'background 0.15s', cursor: clickable ? 'pointer' : 'default' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = !n.read ? 'rgba(79,70,229,0.04)' : 'transparent'}>
                  {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', flexShrink: 0, marginTop: 6 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{n.name}</span>
                      {n.oldStatus && <span style={{ color: SC[n.oldStatus] || 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>{n.oldStatus} →</span>}
                      <span style={{ background: (SC[n.type] || '#94a3b8') + '18', color: SC[n.type] || '#94a3b8', border: `1px solid ${SC[n.type] || '#94a3b8'}33`, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{n.type}</span>
                    </div>
                    {msg && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-sub)', marginBottom: 6, lineHeight: 1.5 }}>{msg}</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{fmtTime(n.ts)}</span>
                      {n.responseTime != null && <span>· {n.responseTime}ms</span>}
                      {clickable && <span style={{ color: '#4f46e5', fontWeight: 600 }}>· Lihat detail</span>}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onDelete?.(i) }} title="Hapus" style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function SettingsModal({ onClose }) {
  const { lang, setLanguage, LANGUAGES, themeId, setTheme, THEME_OPTIONS, t } = useTheme()
  const [sound, setSound] = useState(() => localStorage.getItem('spmt_sound') !== 'off')
  const [desktopNotif, setDesktopNotif] = useState(() => localStorage.getItem('spmt_desktop_notif') === 'on')
  const [autoAck, setAutoAck] = useState(() => localStorage.getItem('spmt_autoack') === 'on')
  const [langSel, setLangSel] = useState(lang)
  const [themeSel, setThemeSel] = useState(themeId)

  // Theme dipilih dulu (staged), baru diterapkan saat klik Save & Apply
  const handleThemeChange = (id) => {
    setThemeSel(id)
  }

  // Desktop notifications need explicit browser permission before they can be enabled.
  const toggleDesktopNotif = async () => {
    if (desktopNotif) { setDesktopNotif(false); return }
    if (!('Notification' in window)) {
      alert(t.noDesktopSupport)
      return
    }
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm === 'granted') setDesktopNotif(true)
    else alert(t.notifDenied)
  }

  const PREFS = [
    { l: `🔔 ${t.notifSound}`, d: t.notifSoundDesc, s: sound, set: () => setSound(v => !v) },
    { l: `🖥️ ${t.desktopNotif}`, d: t.desktopNotifDesc, s: desktopNotif, set: toggleDesktopNotif },
    { l: `🎯 ${t.autoAck}`, d: t.autoAckDesc, s: autoAck, set: () => setAutoAck(v => !v) },
  ]

  const save = () => {
    localStorage.setItem('spmt_sound', sound ? 'on' : 'off')
    localStorage.setItem('spmt_desktop_notif', desktopNotif ? 'on' : 'off')
    localStorage.setItem('spmt_autoack', autoAck ? 'on' : 'off')
    setTheme(themeSel)
    setLanguage(langSel)
    window.location.reload()
  }
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', borderRadius: 14, width: 440, maxWidth: '94vw', boxShadow: 'var(--shadow-glow)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-header)', borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>⚙️ {t.systemSettings}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', maxHeight: '65vh', overflowY: 'auto' }}>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 16 }}>🎨 {t.themeSelection}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
            {THEME_OPTIONS.map(theme => (
              <div
                key={theme.id}
                onClick={() => handleThemeChange(theme.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
                  background: themeSel === theme.id ? 'var(--accent-light)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${themeSel === theme.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: themeSel === theme.id ? `0 0 10px ${theme.color}20 inset` : 'none'
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: theme.color, boxShadow: `0 0 8px ${theme.color}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: themeSel === theme.id ? 'var(--text)' : 'var(--text-sub)' }}>{theme.dark ? t.darkMode : t.lightMode}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 10 }}>🌐 {t.languageLabel}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {Object.values(LANGUAGES).map(L => (
              <div
                key={L.code}
                onClick={() => setLangSel(L.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
                  background: langSel === L.code ? 'var(--accent-light)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${langSel === L.code ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: 15 }}>{L.flag}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: langSel === L.code ? 'var(--text)' : 'var(--text-sub)' }}>{L.label}</span>
              </div>
            ))}
          </div>



          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 6 }}>⚙️ {t.monitoringPreferences}</div>
          {PREFS.map(item => (
            <div key={item.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.l}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{item.d}</div>
              </div>
              <button
                onClick={item.set}
                style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', background: item.s ? 'var(--accent)' : 'rgba(0,0,0,0.3)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                <span style={{ position: 'absolute', top: 2, left: item.s ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-header)', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-sub)', borderRadius: 7, padding: '7px 18px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{t.cancel}</button>
          <button onClick={save} style={{ background: 'var(--accent)', border: 'none', color: '#ffffffff', borderRadius: 7, padding: '7px 20px', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 0 15px var(--accent-light)' }}>{t.saveApply}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── About Modal ─────────────────────────────────────────────────
function AboutModal({ onClose }) {
  const { t } = useTheme()
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border-strong)', borderRadius: 14, width: 500, maxWidth: '94vw', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>ℹ️ {t.aboutTitle}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, padding: '14px', background: 'rgba(79,70,229,0.06)', borderRadius: 10, border: '1px solid rgba(79,70,229,0.1)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(79,70,229,0.12)', border: '1px solid rgba(79,70,229,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📡</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>SPMT Monitoring System</div>
              <div style={{ fontSize: 12, color: '#4f46e5', marginTop: 2 }}>{t.systemNameSub}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>v2.0.0 · 2026</div>
            </div>
          </div>
          {[
            [`🎯 ${t.aboutPurpose}`, t.aboutPurposeDesc],
            [`🔍 ${t.aboutHow}`, t.aboutHowDesc],
            [`🛡️ ${t.aboutSecurity}`, t.aboutSecurityDesc],
            [`📊 ${t.aboutFeatures}`, t.aboutFeaturesDesc],
          ].map(([title, d]) => (
            <div key={title} style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(99,102,241,0.03)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}

          {/* Sinergi Section */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-sub)', letterSpacing: '0.1em', marginBottom: 12, textTransform: 'uppercase' }}>{t.sinergiCoreValues}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { img: 'pelindo.png', title: 'PELINDO', desc: t.brandPelindoDesc },
                { img: 'danan.png', title: 'DANANTARA', desc: t.brandDananDesc },
                { img: 'bumn', title: 'BUMN', desc: t.brandBumnDesc },
                { img: 'akhlak', title: 'AKHLAK', desc: t.brandAkhlakDesc }
              ].map(b => (
                <div key={b.title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', background: 'var(--bg-main)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <img src={`/images/logos/${b.img}${b.img.includes('.') ? '' : '.png'}`} alt={b.title} style={{ height: 20, width: 'auto', maxWidth: 40, objectFit: 'contain' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--primary)' }}>{b.title}</span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.2 }}>{b.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Logout Confirm ──────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
  const { t } = useTheme()
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,41,59,0.45)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: '32px', width: 320, textAlign: 'center', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🚪</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t.logoutQ}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{t.logoutConfirm}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--text-sub)', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.cancel}</button>
          <button onClick={onConfirm} style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', color: 'var(--text)', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t.logout}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Profile Modal ───────────────────────────────────────────────
function ProfileModal({ user, onClose }) {
  const { updateUser } = useAuth()
  const { t } = useTheme()
  const [activeTab, setActiveTab] = useState('profile') // 'profile' or 'security'
  const [avatar, setAvatar] = useState(() => localStorage.getItem(`spmt_avatar_${user?.username}`) || null)
  const [email, setEmail] = useState(user?.email || '')
  const [telegramId, setTelegramId] = useState(user?.telegram_id || '')
  const [showPw, setShowPw] = useState(false)
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  useEffect(() => {
    setOldPassword(''); setNewPassword(''); setConfirmPassword('')
  }, [activeTab])

  // Email change fields
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  const [currentEmailConfirm, setCurrentEmailConfirm] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [confirmNewEmail, setConfirmNewEmail] = useState('')

  // Password fields
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

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

  const handleSave = async (type = 'profile') => {
    setLoading(true)
    try {
      if (type === 'profile') {
        if (email && !isValidEmail(email)) {
          showToast('Please enter a valid email address', 'error')
          return
        }
        await authAPI.updateProfile({ email, telegram_id: telegramId })
        updateUser({ email, telegram_id: telegramId })
        showToast('Profile updated successfully', 'success')
        onClose()
      } else if (type === 'email') {
        const isFirstTime = !user?.email;
        if (!newEmail || !confirmNewEmail) {
          showToast('Please fill in both new email fields', 'error')
          return
        }
        if (!isFirstTime && !currentEmailConfirm) {
          showToast('Please confirm your current email address', 'error')
          return
        }
        if (!isFirstTime && currentEmailConfirm !== user?.email) {
          showToast('Current email is incorrect', 'error')
          return
        }
        if (newEmail !== confirmNewEmail) {
          showToast('New emails do not match', 'error')
          return
        }
        if (!isValidEmail(newEmail)) {
          showToast('Please enter a valid email address', 'error')
          return
        }
        await authAPI.updateProfile({ email: newEmail, telegram_id: telegramId })
        updateUser({ email: newEmail, telegram_id: telegramId })
        setEmail(newEmail)
        setShowChangeEmail(false)
        setCurrentEmailConfirm('')
        setNewEmail('')
        setConfirmNewEmail('')
        showToast('Email updated successfully', 'success')
        onClose() // Tutup modal setelah sukses agar tidak stuck di processing
      } else if (type === 'security') {
        if (!oldPassword || !newPassword || !confirmPassword) {
          showToast('Please fill all password fields', 'error')
          return
        }
        if (newPassword.length < 6) {
          showToast('New password must be at least 6 characters', 'error')
          return
        }
        if (newPassword !== confirmPassword) {
          showToast('New passwords do not match', 'error')
          return
        }
        if (newPassword === oldPassword) {
          showToast('New password must be different from the old password', 'error')
          return
        }
        await authAPI.changePassword({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword })
        showToast('Password changed successfully', 'success')
        onClose()
      } else if (type === 'test_email') {
        await authAPI.testEmail()
        showToast('Test email sent! Please check your inbox.', 'success')
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Operation failed'
      showToast(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', borderRadius: 14, width: 440, maxWidth: '94vw', boxShadow: 'var(--shadow)', animation: 'fadeIn 0.15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onClose} title={t.back || 'Back'}
              style={{ background: 'var(--bg-header)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              ← {t.back || 'Back'}
            </button>
            <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>👤 {t.customizationProfile}</span>
          </div>
          <button onClick={onClose} title={t.close || 'Close'} style={{ background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: 16 }}>✕</button>
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
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>{t.roleLabel}: {user?.role.toUpperCase()}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ background: 'var(--accent)', color: '#fff', padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  {t.uploadPhoto} <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
                </label>
                {avatar && <button onClick={handleRemove} style={{ background: 'transparent', border: '1px solid var(--offline)', color: 'var(--offline)', padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>{t.remove}</button>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
            <div
              onClick={() => setActiveTab('profile')}
              style={{ padding: '10px 4px', fontSize: 15, fontWeight: 900, color: activeTab === 'profile' ? 'var(--accent)' : 'var(--text-sub)', borderBottom: `2px solid ${activeTab === 'profile' ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {t.generalSettings}
            </div>
            <div
              onClick={() => setActiveTab('security')}
              style={{ padding: '10px 4px', fontSize: 15, fontWeight: 900, color: activeTab === 'security' ? 'var(--accent)' : 'var(--text-sub)', borderBottom: `2px solid ${activeTab === 'security' ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {t.securityTab}
            </div>
          </div>

          <div style={{ background: 'var(--bg-header)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)' }}>
            {activeTab === 'profile' ? (
              <>
                <h4 style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.05em' }}>{t.personalNotifSettings}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* Email Section */}
                  <div style={{ background: 'rgba(38, 74, 236, 0.15)', padding: '16px', borderRadius: 12, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 40, opacity: 0.05, pointerEvents: 'none' }}>✉️</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.08em' }}>
                        {t.currentEmailAddress}
                      </div>
                      {!user?.email && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 800, padding: '2px 8px', background: 'rgba(239,68,68,0.15)', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)' }}>{t.required}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <div style={{
                          width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '12px 14px 12px 38px', fontSize: 16, color: email ? 'var(--text)' : 'var(--text-muted)',
                          fontWeight: 800, letterSpacing: '0.02em', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                          <span style={{ position: 'absolute', left: 12, fontSize: 20, opacity: 0.7 }}>📧</span>
                          {email || t.noEmailYet}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowChangeEmail(!showChangeEmail)}
                        style={{
                          background: showChangeEmail ? 'rgba(239,68,68,0.15)' : 'var(--accent)',
                          border: showChangeEmail ? '1px solid #ef4444' : 'none',
                          color: showChangeEmail ? '#ef4444' : '#fff',
                          borderRadius: 8, padding: '12px 24px', fontSize: 13, fontWeight: 900,
                          cursor: 'pointer', transition: 'all 0.2s', boxShadow: showChangeEmail ? 'none' : '0 4px 12px var(--accent-light)'
                        }}
                      >
                        {showChangeEmail ? t.closeBtn : (user?.email ? t.changeBtn : t.setEmailBtn)}
                      </button>
                    </div>

                    {showChangeEmail && (
                      <div style={{
                        marginTop: 18, padding: '18px', background: 'var(--bg-card)',
                        borderRadius: 12, border: '1px solid var(--accent)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2), 0 0 0 1px var(--accent)',
                        animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                          <div style={{ width: 4, height: 16, background: 'var(--accent)', borderRadius: 2 }} />
                          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text)', letterSpacing: '0.05em' }}>{t.updateEmailIdentity}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                            {user?.email && (
                              <>
                                <div style={{ position: 'relative' }}>
                                  <label style={{ display: 'block', fontSize: 9, color: 'var(--accent)', marginBottom: 5, fontWeight: 800, letterSpacing: '0.05em' }}>{t.confirmCurrentEmail}</label>
                                  <input
                                    type="email"
                                    value={currentEmailConfirm}
                                    onChange={e => setCurrentEmailConfirm(e.target.value)}
                                    placeholder={t.typeExistingEmail}
                                    style={{ width: '100%', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text)', outline: 'none', transition: 'border 0.2s' }}
                                  />
                                </div>
                                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0', opacity: 0.5 }} />
                              </>
                            )}
                            <div>
                              <label style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 800, letterSpacing: '0.05em' }}>{t.newEmailAddress}</label>
                              <input
                                type="email"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder={t.enterNewEmail}
                                style={{ width: '100%', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 800, letterSpacing: '0.05em' }}>{t.retypeNewEmail}</label>
                              <input
                                type="email"
                                value={confirmNewEmail}
                                onChange={e => setConfirmNewEmail(e.target.value)}
                                placeholder={t.confirmNewEmail}
                                style={{ width: '100%', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => handleSave('email')}
                            disabled={loading || !newEmail || !confirmNewEmail}
                            style={{
                              marginTop: 6, background: 'linear-gradient(135deg, var(--accent), #4f46e5)',
                              border: 'none', color: '#fff', borderRadius: 8, padding: '12px',
                              fontSize: 12, fontWeight: 800, cursor: 'pointer',
                              boxShadow: '0 4px 15px rgba(79, 70, 229, 0.3)',
                              opacity: (loading || !newEmail) ? 0.6 : 1,
                              transition: 'transform 0.1s active'
                            }}
                          >
                            {loading ? t.processing : t.confirmIdentityChange}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Telegram Section */}
                  <div style={{ background: 'rgba(70, 90, 217, 0.23)', padding: '16px', borderRadius: 12, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 40, opacity: 0.05, pointerEvents: 'none' }}>📱</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 800, letterSpacing: '0.08em' }}>
                      {t.telegramIntegration} <span style={{ color: 'var(--text-sub)', fontWeight: 400, opacity: 0.6 }}>({t.optional})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                        <span style={{ position: 'absolute', left: 12, fontSize: 16, opacity: 0.7 }}>📱</span>
                        <input
                          type="text"
                          value={telegramId}
                          onChange={e => setTelegramId(e.target.value)}
                          placeholder={t.telegramPlaceholder}
                          style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px 10px 38px', fontSize: 13, color: 'var(--text)', outline: 'none', fontWeight: 600 }}
                        />
                      </div>
                      <button
                        onClick={() => handleSave('profile')}
                        disabled={loading}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '0 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', opacity: loading ? 0.6 : 1 }}
                      >
                        {user?.telegram_id ? t.updateBtn : t.linkBtn}
                      </button>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12 }}>ℹ️</span> {t.telegramHelp}
                    </div>
                  </div>

                  {/* Test Notification Section */}
                  <div style={{ background: 'rgba(79,70,229,0.05)', padding: '16px', borderRadius: 12, border: '1px dashed var(--accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)' }}>{t.testSystemNotif}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{t.testSmtpDesc}</div>
                    </div>
                    <button
                      onClick={() => handleSave('test_email')}
                      disabled={loading}
                      style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 10, fontWeight: 800, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
                    >
                      {loading ? t.sending : t.sendTestEmail}
                    </button>
                  </div>

                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px 0' }}>
                  <h4 style={{ margin: 0, fontSize: 13, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.05em' }}>{t.changeAccountPassword}</h4>
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {showPw ? '🙈' : '👁️'} {showPw ? t.hide || 'Hide' : t.show || 'Show'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 800 }}>{t.oldPassword}</div>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={e => setOldPassword(e.target.value)}
                      placeholder={t.enterCurrentPassword}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 16, color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 800 }}>{t.newPassword}</div>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder={t.enterNewPassword}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 16, color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 800 }}>{t.confirmNewPassword}</div>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder={t.repeatNewPassword}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 16, color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={onClose}
                style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-sub)', borderRadius: 7, padding: '7px 18px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >{t.cancel}</button>
              {activeTab === 'security' && (
                <button
                  onClick={() => handleSave('security')}
                  disabled={loading}
                  style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, padding: '7px 20px', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 0 15px var(--accent-light)', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? t.processing : t.updatePassword}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Network Status Alert ─────────────────────────────────────────
function NetworkAlert({ isOffline, isSlow }) {
  const { t } = useTheme()
  if (!isOffline && !isSlow) return null

  return createPortal(
    <div style={{
      position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000000, width: 'min(400px, 90vw)',
      background: isOffline ? 'rgba(239, 68, 68, 0.95)' : 'rgba(245, 158, 11, 0.95)',
      backdropFilter: 'blur(12px)', color: '#fff', padding: '16px 20px',
      borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.3), 0 0 20px rgba(239,68,68,0.2)',
      border: `1px solid ${isOffline ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)'}`,
      display: 'flex', gap: 16, alignItems: 'center',
      animation: 'slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
        animation: 'pulse 1.5s infinite'
      }}>
        {isOffline ? '📡' : '⏳'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.02em', marginBottom: 2 }}>
          {isOffline ? t.connLost : t.connSlow}
        </div>
        <div style={{ fontSize: 11, opacity: 0.9, lineHeight: 1.4, fontWeight: 600 }}>
          {isOffline ? t.connLostDesc : t.connSlowDesc}
        </div>
      </div>
    </div>,
    document.body
  )
}

function getInitialNav() {
  const saved = localStorage.getItem('spmt_active_nav')
  return ['dashboard', 'websites', 'activity-log', 'users', 'admin-tools'].includes(saved) ? saved : 'dashboard'
}

function AppInner() {
  const { user, isSuperAdmin, logout } = useAuth()
  const { themeId, t } = useTheme()
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
  const [detailWebsiteId, setDetailWebsiteId] = useState(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [isSlow, setIsSlow] = useState(false)

  // Monitor Browser Connectivity
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check for slow connection (if supported)
    if (navigator.connection) {
      const updateConn = () => {
        const type = navigator.connection.effectiveType
        setIsSlow(type === 'slow-2g' || type === '2g' || type === '3g')
      }
      navigator.connection.addEventListener('change', updateConn)
      updateConn()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const websitesRef = useRef(websites)
  useEffect(() => { websitesRef.current = websites }, [websites])



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

  // Native OS notification for critical alerts (works even when the tab is in the background)
  const showDesktopNotif = useCallback((notif) => {
    if (localStorage.getItem('spmt_desktop_notif') !== 'on') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(`🚨 ${notif.name || 'Website'} — ${notif.type}`, {
        body: notif.reason || notif.url || 'Status berubah',
        tag: `spmt-${notif.websiteId}`,
        icon: '/favicon.ico',
      });
      n.onclick = () => { window.focus(); n.close(); };
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

  const triggerGlobalRefresh = useCallback(async () => {
    setGlobalRefreshKey(k => k + 1)
    await Promise.all([loadSummary(), loadWebsites(), loadEvents(), loadUsers()])
  }, [loadSummary, loadWebsites, loadEvents, loadUsers])

  const handleWebsiteUpdate = useCallback(async () => {
    await triggerGlobalRefresh();
    setRefreshTrigger(t => t + 1)
  }, [triggerGlobalRefresh])

  const handleUserUpdate = useCallback(() => {
    loadUsers();
    triggerGlobalRefresh();
  }, [loadUsers, triggerGlobalRefresh])

  useEffect(() => {
    if (!loggedIn) return;
    const controller = new AbortController();

    // Initial Load - Parallel
    triggerGlobalRefresh();

    // Global refresh rates: 1s for summary and websites, 2s for users/events
    const rSummary = 1000;
    const rWebsites = 1000;
    const rUsersEvents = 2000;

    const ivSummary = setInterval(() => loadSummary(controller.signal), rSummary);
    const ivWebsites = setInterval(() => loadWebsites(controller.signal), rWebsites); // More frequent but stable
    const ivUsersEvents = setInterval(() => { loadUsers(); loadEvents(); }, rUsersEvents);

    return () => {
      controller.abort();
      clearInterval(ivSummary);
      clearInterval(ivWebsites);
      clearInterval(ivUsersEvents);
    }
  }, [loggedIn, triggerGlobalRefresh, loadSummary, loadWebsites, loadUsers, loadEvents])

  const navTo = useCallback((nav) => {
    if (nav === 'users' && !isSuperAdmin) return;
    setActiveNav(nav);
    localStorage.setItem('spmt_active_nav', nav);
    // Auto refresh data whenever user switches pages
    triggerGlobalRefresh();
  }, [isSuperAdmin, triggerGlobalRefresh])

  const handleNewNotification = useCallback((notif) => {
    // Recovery event: optionally auto-acknowledge (mark read) prior alerts for this website
    if (notif.type === 'ONLINE') {
      if (localStorage.getItem('spmt_autoack') === 'on') {
        setNotifications(prev => prev.some(n => n.websiteId === notif.websiteId && !n.read)
          ? prev.map(n => n.websiteId === notif.websiteId && !n.read ? { ...n, read: true } : n)
          : prev)
      }
      return
    }
    if (notif.type !== 'OFFLINE' && notif.type !== 'CRITICAL' && notif.type !== 'DEGRADED' && notif.type !== 'WARNING') return
    setNotifications(prev => {
      const dupe = prev.find(n => n.websiteId === notif.websiteId && n.type === notif.type && (Date.now() - n.ts) < 300000);
      if (dupe) return prev;
      if (notif.type === 'OFFLINE') playAlarm(); // Sound ONLY when something goes offline
      showDesktopNotif(notif); // OS-level popup if enabled
      return [{ ...notif, read: false }, ...prev].slice(0, 200)
    })
  }, [playAlarm, showDesktopNotif])

  const handleMarkRead = useCallback((idx) => setNotifications(p => p.map((n, i) => i === idx ? { ...n, read: true } : n)), [])
  const handleMarkAllRead = useCallback(() => setNotifications(p => p.map(n => ({ ...n, read: true }))), [])
  const handleDelete = useCallback((idx) => setNotifications(p => p.filter((_, i) => i !== idx)), [])
  const handleClearAll = useCallback(() => setNotifications([]), [])

  useEffect(() => {
    const h = () => {
      setLoggedIn(false);
      setSummary(null);
      setWebsites([]);
      setNotifications([]);
    }
    window.addEventListener('auth:logout', h)

    // REFRESH ON TAB FOCUS - Ensuring fresh data whenever user returns
    const handleFocus = () => {
      if (loggedIn) {
        loadSummary();
        loadWebsites();
      }
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('auth:logout', h)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loggedIn, loadSummary, loadWebsites])
  const handleLogout = () => {
    setShowLogout(false);
    logout();
    setLoggedIn(false);
    localStorage.removeItem('spmt_active_nav');
    window.location.reload(); // Force full refresh for clean public state
  }

  if (!loggedIn) {
    return (
      <LoginPage
        onLogin={() => {
          setLoggedIn(true)
          showToast(t.loginSuccess)
        }}
      />
    )
  }

  const navItems = ['dashboard', 'websites', 'activity-log', ...(isSuperAdmin ? ['users'] : [])]

  const realtimeSnapshot = {
    online: websites.filter(w => w.status === 'ONLINE').length,
    critical: websites.filter(w => w.status === 'CRITICAL' || w.status === 'DEGRADED' || w.status === 'WARNING').length,
    offline: websites.filter(w => w.status === 'OFFLINE').length,
    unknown: websites.filter(w => !w.status || w.status === 'UNKNOWN').length
  }

  return (
    <div className={themeId} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-main)', color: 'var(--text)', position: 'relative' }}>

      {/* Sci-Fi Ambient Glows (Light Mode) */}
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none', opacity: 0.5 }} />
      <div style={{ position: 'absolute', bottom: '-5%', right: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none', opacity: 0.5 }} />

      <TopBar
        summary={summary} activeNav={activeNav} onNavChange={navTo}
        websites={websites} notifications={notifications}
        onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead}
        onNavigate={(nav) => { if (nav === 'notifications') setShowAllNotifs(true); else navTo(nav) }}
        onOpenDetail={(w) => setDetailWebsiteId(w.id)}
        navItems={navItems}
        isTvMode={isTvMode} onToggleTvMode={toggleTvMode}
        onProfile={() => setShowProfile(true)}
        onLogout={() => setShowLogout(true)}
        onSettings={() => setShowSettings(true)}
        onAbout={() => setShowAbout(true)}
      />
      <div className="page-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, zIndex: 1, position: 'relative' }}>
        {activeNav === 'dashboard' && <DashboardPage onSummaryUpdate={setSummary} websites={websites} onWebsitesUpdate={setWebsites} onNewNotification={handleNewNotification} refreshTrigger={refreshTrigger} realtimeSnapshot={realtimeSnapshot} wsConnected={wsConnected} setWsConnected={setWsConnected} onOpenDetail={(w) => setDetailWebsiteId(w.id)} />}
        {activeNav === 'websites' && <WebsitesPage websites={websites} onWebsiteUpdate={handleWebsiteUpdate} />}
        {activeNav === 'activity-log' && <ActivityLogPage events={allEvents} />}
        {activeNav === 'users' && isSuperAdmin && <UsersPage users={users} onUserUpdate={handleUserUpdate} />}
      </div>

      {detailWebsiteId === 'spmt-server' && (
        <ServerDetailModal onClose={() => setDetailWebsiteId(null)} />
      )}
      {detailWebsiteId && detailWebsiteId !== 'spmt-server' && (
        <ServiceDetailModal 
          website={websites.find(w => w.id === detailWebsiteId)} 
          onClose={() => setDetailWebsiteId(null)} 
        />
      )}
      {showAllNotifs && <AllNotificationsPanel notifications={notifications} onDelete={handleDelete} onClearAll={handleClearAll} onClose={() => setShowAllNotifs(false)}
        onOpen={(n) => {
          setNotifications(prev => prev.map(x => x === n ? { ...x, read: true } : x))
          setDetailWebsiteId(n.websiteId)
          setShowAllNotifs(false)
        }} />}
      {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} />}
      {showLogout && <LogoutModal onConfirm={handleLogout} onCancel={() => setShowLogout(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      <NetworkAlert isOffline={isOffline} isSlow={isSlow} />
    </div>
  )
}

export default function App() { return <ThemeProvider><AuthProvider><WebSocketProvider><AppInner /><ToastContainer /></WebSocketProvider></AuthProvider></ThemeProvider> }
