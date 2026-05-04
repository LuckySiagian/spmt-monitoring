import { useState } from 'react'
import { useAuth } from '../store/auth'
import { Turnstile } from '@marsidev/react-turnstile'
import { authAPI } from '../services/api'
import { showToast } from '../components/dashboard/Toast'

const videos = [
  "/images/background/bg1.MP4",
  "/images/background/bg2.MP4"
]

export default function LoginPage({ onLogin, onBack }) {
  const { login } = useAuth()

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
      setError('Please complete the CAPTCHA')
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
        showToast('Account created successfully! Please sign in.', 'success')
      } else {
        await login(form.username, form.password, turnstileToken)
        onLogin()
      }
    } catch (err) {
      setError(err.response?.data?.error || (isRegister ? 'Registration failed.' : 'Login failed. Check credentials.'))
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
      `}</style>

      {/* BACK BUTTON REMOVED FROM TOP */}

      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
        className="night-port-video"
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

        <div style={s.welcomeText}>{isRegister ? 'Create Account' : 'Welcome'}</div>

        <div style={s.welcomeSub}>
          {isRegister ? 'Sign up to monitor services' : 'Sign in to access the monitoring dashboard'}
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          <input
            style={s.input}
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder={isRegister ? "Username *" : "Username"}
            required
          />

          {isRegister && (
            <>
              <input
                style={s.input}
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email *"
                required
              />
              <input
                style={s.input}
                type="text"
                value={form.telegram_id}
                onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
                placeholder="Telegram ID (optional)"
              />
            </>
          )}

          <input
            style={s.input}
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder={isRegister ? "Password *" : "Password"}
            required
          />

          <div style={{ alignSelf: 'center', margin: '10px 0' }}>
            <Turnstile 
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '3x00000000000000000000FF'} 
              onSuccess={(token) => setTurnstileToken(token)}
            />
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? 'Processing...' : (isRegister ? 'REGISTER' : 'SIGN IN')}
          </button>

        </form>

        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-sub)' }}>
          {isRegister ? 'Already have an account? ' : 'Need an account? '}
          <span 
            onClick={() => { setIsRegister(!isRegister); setError(''); }} 
            style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
          >
            {isRegister ? 'Sign in' : 'Register here'}
          </span>
        </div>

        {/* BRAND LOGOS REMOVED - MOVED TO ABOUT SECTION */}

        {/* BACK TO MONITORING LINK */}
        <button 
          onClick={onBack} 
          style={{ 
            marginTop: '24px', background: 'none', border: 'none', 
            color: 'var(--primary)', fontSize: '12px', fontWeight: 700, 
            cursor: 'pointer', textDecoration: 'underline' 
          }}
        >
          Back To Home
        </button>

      </div>

    </div>
  )
}

const s = {

  root: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    background: '#e7e9ebff'
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
position:'absolute',
top:0,
left:0,
width:'100%',
height:'100%',
objectFit:'cover',
zIndex:0
},

  overlay:{
    position:'absolute',
    inset:0,
    background:'linear-gradient(135deg, rgba(209, 213, 223, 0.33) 0%, rgba(60, 88, 122, 0.3) 100%)',
    zIndex:1
  },

card:{
position:'relative',
zIndex:2,
width:'400px',
maxWidth:'90%',
padding:'40px',
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
height:'90px',
background:'#fdfefeff',
padding: '10px 20px',
borderRadius: '12px',
border:'1px solid #d4c4c4ff',
boxShadow:'0 8px 30px rgba(0,0,0,0.05)',
objectFit:'contain'
},

welcomeText:{
fontSize:'24px',
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
fontSize: '14px',
outline:'none',
transition: 'all 0.2s'
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