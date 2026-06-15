import { useState } from 'react'
import { useAuth } from '../store/auth'
import { useTheme } from '../store/theme'
import { Turnstile } from '@marsidev/react-turnstile'
import { authAPI } from '../services/api'
import { showToast } from '../components/dashboard/Toast'

const videos = [
  "/images/background/bg1.MP4",
  "/images/background/bg2.MP4"
]

export default function LoginPage({ onLogin }) {
  const { login } = useAuth()
  const { t } = useTheme()

  const [form, setForm] = useState({ username: '', password: '', email: '', telegram_id: '' })
  const [turnstileToken, setTurnstileToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)

  // state untuk video background
  const [videoIndex, setVideoIndex] = useState(0)

  const handleVideoEnd = () => {
    setVideoIndex((prev) => (prev + 1) % videos.length)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!turnstileToken) {
      setError(t.completeCaptcha)
      return
    }
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        await authAPI.register({ 
          username: form.username, 
          password: form.password, 
          email: form.email, 
          telegram_id: form.telegram_id 
        })
        // Go back to login and reset form
        setIsRegister(false)
        setForm({ username: '', password: '', email: '', telegram_id: '' })
        setTurnstileToken('')
        if (window.turnstile) window.turnstile.reset() // Reset turnstile widget
        showToast(t.regSuccess, 'success')
      } else {
        await login(form.username, form.password, turnstileToken)
        onLogin()
      }
    } catch (err) {
      setError(err.response?.data?.error || (isRegister ? t.regFailed : t.loginFailed))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.root}>
      <style>{`
        .back-btn-animated {
          animation: slideInRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, pulseGlow 3s infinite;
          transition: all 0.3s ease;
        }
        .back-btn-animated:hover {
          transform: translateX(-5px) scale(1.05);
          box-shadow: 0 0 25px rgba(37, 99, 235, 0.4);
          background: rgba(255, 255, 255, 0.9) !important;
          color: #2563eb !important;
        }

        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(37, 99, 235, 0.2); }
          50% { box-shadow: 0 0 20px rgba(37, 99, 235, 0.5); }
        }

        /* RESPONSIVE: di layar kecil video berat dimatikan,
           background fallback gambar (diset di style root) yang tampil. */
        @media (max-width: 768px) {
          .login-video { display: none; }
        }
        /* Turnstile (~300px) diperkecil agar tidak overflow di layar sangat sempit */
        @media (max-width: 360px) {
          .login-turnstile { transform: scale(0.82); transform-origin: center; }
        }
      `}</style>

      {/* BACK BUTTON REMOVED FROM TOP */}

      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
        className="night-port-video login-video"
        style={s.video}
        src={videos[videoIndex]}
      />

      <div style={s.overlay} />

      {/* LOGIN CARD */}
      <div style={s.card}>

        {/* LOGO */}
        <div style={s.logoWrap}>
          <img
            src="/images/logos/lo.png"
            style={s.logo}
            alt="Pelindo Logo"
          />
        </div>

        <div style={s.welcomeText}>{isRegister ? t.createAccount : t.welcome}</div>

        <div style={s.welcomeSub}>
          {isRegister ? t.signUpMonitor : t.signInAccess}
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          <input
            id="username"
            name="username"
            autoComplete="username"
            style={s.input}
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder={isRegister ? `${t.usernamePh} *` : t.usernamePh}
            required
          />

          {isRegister && (
            <>
              <input
                id="email"
                name="email"
                autoComplete="email"
                style={s.input}
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder={t.emailReqPh}
                required
              />
              <input
                id="telegram_id"
                name="telegram_id"
                autoComplete="off"
                style={s.input}
                type="text"
                value={form.telegram_id}
                onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
                placeholder={t.telegramOptPh}
              />
            </>
          )}

          <input
            id="password"
            name="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            style={s.input}
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder={isRegister ? `${t.passwordPh} *` : t.passwordPh}
            required
          />

          <div className="login-turnstile" style={{ alignSelf: 'center', margin: '10px 0', maxWidth: '100%' }}>
            <Turnstile
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '3x00000000000000000000FF'} 
              onSuccess={(token) => setTurnstileToken(token)}
            />
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? t.processing : (isRegister ? t.register : t.signIn)}
          </button>

        </form>

        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-sub)' }}>
          {isRegister ? t.alreadyHaveAccount : t.needAccount}
          <span
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
          >
            {isRegister ? t.signInLink : t.registerHere}
          </span>
        </div>

        {/* BRAND LOGOS REMOVED - MOVED TO ABOUT SECTION */}


      </div>

    </div>
  )
}

const s = {

  root: {
    width: '100%',
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowY: 'auto',
    padding: 'clamp(16px, 4vw, 32px)',
    position: 'relative',
    // Fallback background (tampil di HP saat video dimatikan via .login-video)
    background: '#e7e9ebff url(/images/background/login-bg.jpg) center/cover no-repeat'
  },
  backBtn: {
    position: 'absolute',
    top: '60px',
    right: '150px',
    zIndex: 100,
    padding: '15px 30px',
    background: 'rgba(190, 190, 190, 0.7)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(37, 235, 195, 0.77)',
    borderRadius: '30px',
    color: 'var(--text)',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 8px 32px rgba(152, 234, 65, 1)'
  },

video:{
position:'fixed',
top:0,
left:0,
width:'100%',
height:'100%',
objectFit:'cover',
zIndex:0
},

  overlay:{
    position:'fixed',
    inset:0,
    background:'linear-gradient(135deg, rgba(209, 213, 223, 0.33) 0%, rgba(60, 88, 122, 0.3) 100%)',
    zIndex:1
  },

card:{
position:'relative',
zIndex:2,
width:'min(400px, 92vw)',
maxWidth:'90%',
padding:'clamp(24px, 5vw, 40px)',
borderRadius:'14px',
background:'rgba(255, 255, 255, 0.95)',
backdropFilter:'blur(15px)',
border:'1px solid rgba(255,255,255,0.8)',
boxShadow:'0 24px 60px rgba(0, 0, 0, 0.08)',
display:'flex',
flexDirection:'column',
alignItems:'center'
},

logoWrap:{
marginBottom:'20px'
},

logo:{
height:'clamp(64px, 18vw, 90px)',
background:'#fdfefeff',
padding: '10px 20px',
borderRadius: '12px',
border:'1px solid #d4c4c4ff',
boxShadow:'0 8px 30px rgba(0,0,0,0.05)',
objectFit:'contain'
},

welcomeText:{
fontSize:'clamp(20px, 5vw, 24px)',
fontWeight:700,
color:'var(--text)'
},

welcomeSub:{
fontSize:'13px',
color:'var(--text-muted)',
marginBottom:'25px'
},

form:{
width:'100%',
display:'flex',
flexDirection:'column',
gap:'14px'
},

input:{
width:'100%',
padding:'14px 16px',
borderRadius:'12px',
border:'1px solid var(--border)',
background:'#ffffff',
color:'var(--text)',
fontSize: '16px', // >=16px agar iOS tidak auto-zoom saat input difokus
outline:'none',
transition: 'all 0.2s',
boxSizing: 'border-box'
},

btn:{
marginTop:'14px',
padding:'14px',
borderRadius:'8px',
border:'none',
background: 'var(--primary)',
color:'#ffffff',
fontSize: '14px',
fontWeight:800,
letterSpacing: '0.05em',
cursor:'pointer',
boxShadow: '0 4px 15px rgba(0, 31, 63, 0.2)'
},

error:{
color:'#ef4444',
fontSize:'12px'
},

footer:{
marginTop:'18px',
fontSize:'11px',
color:'var(--text-muted)'
},

  brandRow:{
    display: 'none'
  }

}