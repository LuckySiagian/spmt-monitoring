import { useState } from 'react'
import { useAuth } from '../store/auth'

const videos = [
  "/images/background/bg1.MP4",
  "/images/background/bg2.MP4"
]

export default function LoginPage({ onLogin }) {
  const { login } = useAuth()

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // state untuk video background
  const [videoIndex, setVideoIndex] = useState(0)

  const handleVideoEnd = () => {
    setVideoIndex((prev) => (prev + 1) % videos.length)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(form.username, form.password)
      onLogin()
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.root}>

      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
        style={s.video}
        src={videos[videoIndex]}
      />

      <div style={s.overlay} />

      {/* LOGIN CARD */}
      <div style={s.card}>

        {/* LOGO */}
        <div style={s.logoWrap}>
          <img
            src="/images/logos/logo spmt fc.png"
            style={s.logo}
            alt="SPMT Logo"
          />
        </div>

        <div style={s.welcomeText}>Welcome</div>

        <div style={s.welcomeSub}>
          Sign in to access the monitoring dashboard
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          <input
            style={s.input}
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder="Username"
            required
          />

          <input
            style={s.input}
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Password"
            required
          />

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? 'Authenticating...' : 'SIGN IN'}
          </button>

        </form>

        {/* BRAND LOGOS */}
        <div style={s.brandRow}>

          <div style={s.brandBox}>
            <img src="/images/logos/danan.png" style={s.brandLogo}/>
          </div>

          <div style={s.brandBox}>
            <img src="/images/logos/bumn.png" style={s.brandLogo}/>
          </div>

          <div style={s.brandBox}>
            <img src="/images/logos/akhlak.png" style={s.brandLogo}/>
          </div>

        </div>

      </div>

    </div>
  )
}

const s = {

root:{
width:'100%',
height:'100vh',
display:'flex',
alignItems:'center',
justifyContent:'center',
overflow:'hidden',
position:'relative',
background:'#ffffff'
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
background:'rgba(255,255,255,0.3)',
zIndex:1
},

card:{
position:'relative',
zIndex:2,
width:'420px',
maxWidth:'90%',
padding:'40px',
borderRadius:'16px',
background:'rgba(73, 80, 98, 0.55)',
backdropFilter:'blur(5px)',
border:'1px solid rgba(255,255,255,0.08)',
boxShadow:'0 20px 80px rgba(48, 75, 97, 0.84)',
display:'flex',
flexDirection:'column',
alignItems:'center'
},

logoWrap:{
marginBottom:'20px'
},

logo:{
height:'100px',
background:'var(--text)',
borderRadius: '10px',
backdropFilter:'blur(100px)',
border:'1px solid rgba(255,255,255,0.08)',
boxShadow:'0 20px 80px rgba(119, 145, 169, 0.84)',
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
padding:'12px 14px',
borderRadius:'8px',
border:'1px solid rgba(255,255,255,0.12)',
background:'rgba(20,30,50,0.7)',
color:'var(--text)',
outline:'none'
},

btn:{
marginTop:'10px',
padding:'13px',
borderRadius:'8px',
border:'none',
background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',
color:'var(--text)',
fontWeight:700,
cursor:'pointer'
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
marginTop:'28px',
display:'flex',
gap:'5px'
},

brandBox:{
background:'var(--text)',
padding:'6px 13px',
borderRadius:'15px',
display:'flex',
alignItems:'center'
},

brandLogo:{
height:'34px',
objectFit:'contain'
}

}