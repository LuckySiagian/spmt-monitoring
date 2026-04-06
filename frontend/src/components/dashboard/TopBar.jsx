import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../store/auth'
import { useTheme } from '../../store/theme'
import NotificationBell from './NotificationBell'
import MetricDetailModal from './MetricDetailModal'

const fmtSLA = v => v==null?'0.00':Number(v).toFixed(2)
const DROPDOWN_ID = 'profile-dd'

function ProfileDropdown({ user, avatar, onProfile, onLogout, onSettings, onAbout, onClose, rect }) {
  if (!rect) return null
  const rc = { superadmin:'#7c3aed', admin:'#3b82f6', viewer:'#64748b' }[user?.role] || '#64748b'
  const rl = { superadmin:'SuperAdmin', admin:'Admin', viewer:'Viewer' }[user?.role] || 'User'
  return createPortal(
    <div id={DROPDOWN_ID} style={{ position:'fixed', top:rect.bottom+8, right:window.innerWidth-rect.right, width:210,
      background:'var(--bg-header)', backdropFilter:'blur(20px)', border:'1px solid var(--border)',
      borderRadius:12, boxShadow:'var(--shadow)', zIndex:99995, overflow:'hidden', animation:'fadeIn 0.15s ease' }}>
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', background:'var(--accent-light)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:avatar?'transparent':`linear-gradient(135deg,${rc}22,${rc}44)`, border:`2px solid ${rc}66`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:rc, overflow:'hidden' }}>
            {avatar ? <img src={avatar} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/> : (user?.username||'?')[0].toUpperCase()}
          </div>
          <div><div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{user?.username}</div><div style={{ fontSize:10, color:rc, fontWeight:600 }}>{rl}</div></div>
        </div>
      </div>
      {[{icon:'👤',label:'Profile',action:onProfile},{icon:'⚙️',label:'Settings',action:onSettings},{icon:'ℹ️',label:'About',action:onAbout},{icon:'🚪',label:'Logout',action:onLogout,danger:true}].map(item=>(
        <button key={item.label} onClick={()=>{item.action();onClose()}}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left', color:item.danger?'var(--offline)':'var(--text)', fontSize:13, fontWeight:500, borderTop:'1px solid var(--border)', transition:'background 0.12s' }}
          onMouseEnter={e=>e.currentTarget.style.background=item.danger?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <span style={{ fontSize:15 }}>{item.icon}</span>{item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}

export default function TopBar({ summary, onNavChange, activeNav, websites=[], notifications=[], onMarkRead, onMarkAllRead, navItems=['dashboard','websites','activity-log'], onNavigate, onLogout, onSettings, onAbout, onProfile, isTvMode, onToggleTvMode }) {
  const { user } = useAuth()
  const { t } = useTheme()
  const [activeMetric, setActiveMetric] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [showProfile, setShowProfile] = useState(false)
  const [profileRect, setProfileRect] = useState(null)
  const [avatar, setAvatar] = useState(()=>localStorage.getItem(`spmt_avatar_${user?.username}`)||null)
  const profileRef = useRef(null)

  useEffect(()=>{
    const h = () => setAvatar(localStorage.getItem(`spmt_avatar_${user?.username}`)||null)
    window.addEventListener('AvatarUpdated', h)
    return () => window.removeEventListener('AvatarUpdated', h)
  }, [user?.username])

  useEffect(()=>{ const iv=setInterval(()=>setClock(new Date()),1000); return ()=>clearInterval(iv) },[])
  useEffect(()=>{
    const h=(e)=>{
      if(profileRef.current&&profileRef.current.contains(e.target))return
      const dd=document.getElementById(DROPDOWN_ID)
      if(dd&&dd.contains(e.target))return
      setShowProfile(false)
    }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])

  const alertCount = summary?.active_alerts??0
  const metrics = [
    {label:t?.online||'ONLINE',   value:summary?.online_count??0,   color:'var(--online)'},
    {label:t?.critical||'CRITICAL', value:summary?.critical_count??0, color:'var(--critical)'},
    {label:t?.offline||'OFFLINE',  value:summary?.offline_count??0,  color:'var(--offline)'},
    {label:t?.unknown||'UNKNOWN',  value:summary?.unknown_count??0,  color:'var(--text-muted)'},
    {label:'SLA',      value:`${fmtSLA(summary?.sla_percent)}%`, color:'var(--accent)'},
    {label:t?.total||'TOTAL',    value:summary?.total_websites??0, color:'var(--text-sub)'},
    {label:'AVG RT',   value:`${Math.round(summary?.avg_response_time??0)}ms`, color:'#8b5cf6'},
    {label:t?.alerts||'ALERTS',   value:alertCount, color:alertCount>0?'var(--offline)':'var(--text-muted)'},
  ]

  const slaPct = Number(summary?.sla_percent || 100);

  const rc = {superadmin:'#8b5cf6',admin:'#3b82f6',viewer:'#64748b'}[user?.role]||'#64748b'
  const rl = {superadmin:'SA',admin:'AD',viewer:'VW'}[user?.role]||'??'
  const navLabel = tab => {
    if(tab==='dashboard')    return `📊 ${t?.dashboard||'Dashboard'}`
    if(tab==='websites')     return `🌐 ${t?.websites||'Websites'}`
    if(tab==='activity-log') return `📋 ${t?.activity||'Activity'}`
    if(tab==='notifications')return `🔔 ${t?.notifications||'Notifications'}`
    if(tab==='users')        return `👥 ${t?.users||'Users'}`
    return tab
  }

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0,
        height:64, padding:'0 16px',
        background:'var(--bg-header)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
        borderBottom:'1px solid var(--border)',
        boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
        position:'relative', zIndex:100 }}>

        {/* Logo */}
        <div style={{ flexShrink:0, paddingRight:16, borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
          <img src="/images/logos/logo spmt fc.png" alt="SPMT"
            style={{ height:36, objectFit:'contain', animation:'logoPulse 4s ease-in-out infinite' }} />
        </div>

        {/* Cyberpunk Metric HUD */}
        <div className="topbar-metrics" style={{ display:'flex', gap:8, flex:1, alignItems:'center', minWidth:0, overflow:'hidden', paddingLeft:8 }}>
          {metrics.map(m=>{
            const active = activeMetric===m.label
            const isAlert = (m.label === t?.alerts || m.label === 'ALERTS') && m.value > 0
            
            return (
              <div key={m.label} title={`Detail ${m.label}`}
                className="hover-glow"
                style={{ 
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', 
                  padding:'4px 12px', borderRadius:6, cursor:'pointer', userSelect:'none', flexShrink:1, minWidth:60,
                  background: active ? `linear-gradient(180deg, transparent, ${m.color}15)` : 'transparent',
                  borderBottom: `2px solid ${active ? m.color : m.color+'40'}`,
                  transition:'all 0.2s', position: 'relative'
                }}
                onClick={()=>setActiveMetric(active?null:m.label)}>
                
                {isAlert && <span style={{ position:'absolute', top:2, right:4, width:6, height:6, borderRadius:'50%', background:'var(--offline)', animation:'pulse 1s infinite' }} />}
                
                <div style={{ color:m.color, fontSize:active?18:16, fontWeight:800, fontFamily:'monospace', textShadow:`0 0 10px ${m.color}66`, transition:'all 0.2s' }}>{m.value}</div>
                <div style={{ fontSize:9, color:m.color, letterSpacing:'0.1em', marginTop:2, fontWeight:700, opacity:0.8 }}>{m.label}</div>
              </div>
            )
          })}
        </div>

        {/* Nav */}
        <div className="topbar-nav" style={{ display:'flex', gap:4, background:'var(--accent-light)', border:'1px solid var(--border)', borderRadius:8, padding:'4px', height:36, flexShrink:0 }}>
          {navItems.map(tab=>(
            <button key={tab}
              style={{ 
                background:activeNav===tab?'var(--bg-card)':'transparent', 
                border:activeNav===tab?'1px solid var(--border)':'1px solid transparent', 
                color:activeNav===tab?'var(--accent)':'var(--text-sub)',
                fontSize:11, fontWeight:700, letterSpacing:'0.04em', padding:'0 14px', borderRadius:6, 
                cursor:'pointer', height:'100%', whiteSpace:'nowrap', boxShadow:activeNav===tab?'0 0 10px rgba(99,102,241,0.2)':'none' 
              }}
              onClick={()=>onNavChange(tab)}>{navLabel(tab)}</button>
          ))}
        </div>

        {/* Mini SLA Donut for TV Mode Highlight */}
        {isTvMode && (
          <div style={{ display:'flex', alignItems:'center', gap:8, borderLeft:'1px solid var(--border)', paddingLeft:16 }}>
            <svg width="34" height="34" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={slaPct>99?'#10b981':slaPct>80?'#f59e0b':'#ef4444'} strokeWidth="4"
                strokeDasharray="88" strokeDashoffset={88 - (slaPct / 100) * 88} strokeLinecap="round" transform="rotate(-90 18 18)" style={{transition:'stroke-dashoffset 1s ease-in-out'}}/>
            </svg>
            <div style={{ display:'flex', flexDirection:'column' }}>
              <span style={{ fontSize:15, fontWeight:800, color:'var(--text)', lineHeight:1 }}>{slaPct.toFixed(2)}%</span>
              <span style={{ fontSize:9, color:'var(--accent)', fontWeight:700, letterSpacing:'0.1em' }}>SLA 24H</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="topbar-actions" style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <button onClick={onToggleTvMode} className="hover-glow" title="Masuk/Keluar Kiosk TV Mode"
             style={{ display:'flex', alignItems:'center', justifyContent:'center', gap: 6, padding: '0 12px', height:36, borderRadius:8, background:isTvMode?'rgba(99,102,241,0.2)':'transparent', border:isTvMode?'1px solid var(--accent)':'1px solid transparent', color:isTvMode?'var(--accent)':'var(--text-sub)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
              <polyline points="17 2 12 7 7 2"></polyline>
            </svg>
            {!isTvMode && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>TV NOC</span>}
          </button>

          <NotificationBell notifications={notifications} onMarkRead={onMarkRead} onMarkAllRead={onMarkAllRead} onNavigate={onNavigate}/>

          <div style={{ flexShrink:0, padding:'0 12px', borderLeft:'1px solid var(--border)', borderRight:'1px solid var(--border)' }}>
            <div style={{ color:'var(--text)', fontSize:13, fontWeight:700, fontFamily:'monospace', letterSpacing:'0.08em', textShadow:'0 0 8px rgba(255,255,255,0.3)' }}>
              {clock.toLocaleTimeString('id-ID',{hour12:false})}
            </div>
          </div>

          {/* Profile avatar */}
          <div ref={profileRef} style={{ position:'relative', flexShrink:0 }}>
            <button onClick={()=>{ setShowProfile(v=>!v); if(profileRef.current) setProfileRect(profileRef.current.getBoundingClientRect()) }}
              className="hover-glow"
              style={{ display:'flex', alignItems:'center', gap:8, background:'var(--accent-light)', border:`1px solid var(--border)`, borderRadius:20, padding:'4px 12px 4px 4px', cursor:'pointer' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:avatar?'transparent':`linear-gradient(135deg,${rc}22,${rc}44)`, border:`2px solid ${rc}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:rc, flexShrink:0, textShadow:`0 0 5px ${rc}`, overflow:'hidden' }}>
                {avatar ? <img src={avatar} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/> : (user?.username||'?')[0].toUpperCase()}
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', minWidth:0 }}>
                <span style={{ color:'var(--text)', fontSize:11, fontWeight:700, whiteSpace:'nowrap', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis' }}>{user?.username}</span>
              </div>
              <span style={{ color:'var(--text-muted)', fontSize:10 }}>▾</span>
            </button>
            {showProfile && <ProfileDropdown user={user} avatar={avatar} rect={profileRect} onProfile={onProfile} onLogout={onLogout} onSettings={onSettings} onAbout={onAbout} onClose={()=>setShowProfile(false)}/>}
          </div>
        </div>
      </div>

      {activeMetric && <MetricDetailModal type={activeMetric} websites={websites} summary={summary} onClose={()=>setActiveMetric(null)}/>}
    </>
  )
}
