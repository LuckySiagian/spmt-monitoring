import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { notificationAPI } from '../../services/api'

const SC = { ONLINE:'#059669',CRITICAL:'#d97706',OFFLINE:'#dc2626',UNKNOWN:'#64748b' }
const SI = { ONLINE:'🟢',CRITICAL:'🟠',OFFLINE:'🔴',UNKNOWN:'⚪' }
const DD_ID = 'spmt-notif-dd'
const getDomain = url => { try{return new URL(url).hostname}catch{return null} }

function NotifDetailModal({ n, onClose }) {
  const domain = n.url?getDomain(n.url):null
  return createPortal(
    <div style={{ position:'fixed',inset:0,background:'rgba(30,41,59,0.45)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'rgba(255,255,255,0.97)',backdropFilter:'blur(20px)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:14,width:400,maxWidth:'92vw',boxShadow:'0 16px 48px rgba(99,102,241,0.2)',animation:'fadeIn 0.15s ease' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid rgba(99,102,241,0.1)' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            {domain&&<img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} width={18} height={18} alt="" onError={e=>{e.target.style.display='none'}} style={{ borderRadius:4 }}/>}
            <span style={{ fontSize:13,fontWeight:700,color:'var(--text)' }}>{n.name}</span>
            <span style={{ background:(SC[n.type]||'#64748b')+'18',color:SC[n.type]||'#64748b',border:`1px solid ${SC[n.type]||'#64748b'}33`,borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:700 }}>{n.type}</span>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'6px 18px 18px' }}>
          {[['Status Change',<><span style={{ color:SC[n.oldStatus]||'#64748b',fontWeight:600 }}>{n.oldStatus||'—'}</span><span style={{ color:'#cbd5e1',margin:'0 8px' }}>→</span><span style={{ color:SC[n.type]||'var(--text)',fontWeight:700 }}>{n.type}</span></>],
            ['Root Cause',<span style={{ color:'#d97706' }}>{n.reason||'—'}</span>],
            n.ip&&['IP',<span style={{ color:'#64748b' }}>{n.ip}</span>],
            n.responseTime!=null&&['Response',<span style={{ color:n.responseTime>3000?'#d97706':'#059669' }}>{n.responseTime}ms</span>],
            n.url&&['URL',<span style={{ color:'#4f46e5',fontSize:11,wordBreak:'break-all' }}>{n.url}</span>],
            ['Time',<span style={{ color:'var(--text-muted)',fontSize:11 }}>{new Date(n.ts).toLocaleString('id-ID',{hour12:false})}</span>],
          ].filter(Boolean).map(([k,v])=>(
            <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(99,102,241,0.06)' }}>
              <span style={{ fontSize:10,color:'var(--text-muted)',fontWeight:700,letterSpacing:'0.06em',flexShrink:0 }}>{k}</span>
              <div style={{ textAlign:'right',fontSize:12 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

function NotifDropdown({ notifications, unread, bellRef, onMarkAll, onItemClick, onViewAll }) {
  const [rect,setRect]=useState(null)
  useEffect(()=>{ if(bellRef.current) setRect(bellRef.current.getBoundingClientRect()) },[bellRef])
  if(!rect) return null
  const fmt = ts=>new Date(ts).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
  return createPortal(
    <div id={DD_ID} style={{ position:'fixed',top:rect.bottom+6,right:window.innerWidth-rect.right,width:340,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(20px)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:12,boxShadow:'0 8px 32px rgba(99,102,241,0.18)',zIndex:99990,overflow:'hidden',animation:'fadeIn 0.15s ease' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid rgba(99,102,241,0.1)',background:'var(--bg-card)' }}>
        <span style={{ fontSize:12,fontWeight:700,color:'var(--text)' }}>🔔 Notifications</span>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          {unread>0&&<button style={{ background:'rgba(79,70,229,0.1)',border:'1px solid rgba(79,70,229,0.2)',color:'#4f46e5',borderRadius:4,padding:'2px 8px',fontSize:9,fontWeight:700,cursor:'pointer' }} onClick={onMarkAll}>Mark all read</button>}
          <span style={{ fontSize:10,color:'#64748b' }}>{unread>0?`${unread} unread`:'All read'}</span>
        </div>
      </div>
      <div style={{ maxHeight:360,overflowY:'auto' }}>
        {notifications.length===0?<div style={{ textAlign:'center',color:'var(--text-muted)',fontSize:12,padding:'28px 0' }}>No notifications yet</div>
        :notifications.slice(0,50).map((n,i)=>{
          const domain=n.url?getDomain(n.url):null
          return(
            <div key={i} style={{ display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',borderBottom:'1px solid rgba(99,102,241,0.06)',background:!n.read?'rgba(79,70,229,0.05)':'transparent',cursor:'pointer',transition:'background 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,0.06)'}
              onMouseLeave={e=>e.currentTarget.style.background=!n.read?'rgba(79,70,229,0.05)':'transparent'}
              onClick={()=>onItemClick(n,i)}>
              {domain?<img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} width={16} height={16} alt="" onError={e=>{e.target.style.display='none'}} style={{ borderRadius:3,flexShrink:0,marginTop:1 }}/>:<span style={{ fontSize:14,flexShrink:0,lineHeight:1 }}>{SI[n.type]||'🔔'}</span>}
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:12,fontWeight:700,color:SC[n.type]||'var(--text)',display:'flex',alignItems:'center',gap:6 }}>
                  {n.name}{!n.read&&<span style={{ fontSize:8,background:'#f0ededff',color:'var(--text)',borderRadius:3,padding:'1px 4px',fontWeight:700 }}>NEW</span>}
                </div>
                <div style={{ fontSize:10,color:'var(--text-muted)',marginTop:1 }}>
                  {n.oldStatus&&<><span style={{ color:SC[n.oldStatus]||'var(--text-muted)' }}>{n.oldStatus}</span><span style={{ color:'#000000ff',margin:'0 4px' }}>→</span></>}
                  <span style={{ color:SC[n.type]||'var(--text-muted)',fontWeight:600 }}>{n.type}</span>
                </div>
                {n.reason&&<div style={{ fontSize:10,color:'var(--text-muted)',marginTop:2 }}>{n.reason}</div>}
                <div style={{ fontSize:10,color:'#cbd5e1',marginTop:3,fontVariantNumeric:'tabular-nums' }}>{fmt(n.ts)}</div>
              </div>
              <span style={{ color:'#cbd5e1',fontSize:12,flexShrink:0 }}>›</span>
            </div>
          )
        })}
      </div>
      <div style={{ padding:'8px 14px',background:'var(--bg-card)',borderTop:'1px solid rgba(99,102,241,0.1)',textAlign:'center' }}>
        <button style={{ background:'none',border:'none',color:'#4f46e5',fontSize:11,fontWeight:700,cursor:'pointer' }} onClick={onViewAll}>View All Notifications →</button>
      </div>
    </div>,
    document.body
  )
}

export default function NotificationBell({ notifications=[], onMarkRead, onMarkAllRead, onNavigate }) {
  const [open,setOpen]=useState(false)
  const [detail,setDetail]=useState(null)
  const bellRef=useRef(null)
  const unread=notifications.filter(n=>!n.read).length

  useEffect(()=>{
    const h=e=>{ if(bellRef.current&&bellRef.current.contains(e.target))return; const dd=document.getElementById(DD_ID); if(dd&&dd.contains(e.target))return; setOpen(false) }
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])

  const handleMarkAll = async()=>{ onMarkAllRead?.(); try{await notificationAPI.markAllRead()}catch{} }
  const handleItemClick=(n,i)=>{ if(!n.read)onMarkRead?.(i); setDetail(n); setOpen(false) }
  const handleViewAll=()=>{ setOpen(false); setTimeout(()=>onNavigate?.('notifications'),50) }

  return (
    <>
      <div ref={bellRef} style={{ position:'relative',flexShrink:0 }}>
        <button style={{ position:'relative',background:'rgba(79,70,229,0.08)',border:'1px solid rgba(79,70,229,0.2)',color:'#6366f1',borderRadius:8,padding:'7px 9px',cursor:'pointer',display:'flex',alignItems:'center',transition:'all 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(79,70,229,0.14)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(79,70,229,0.08)'}
          onClick={()=>setOpen(v=>!v)} title="Notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unread>0&&<span style={{ position:'absolute',top:-6,right:-6,background:'#ff0000cc',color:'#fffcfcff',fontSize:9,fontWeight:700,borderRadius:10,padding:'1px 5px',minWidth:16,textAlign:'center',border:'2px solid #000000ff' }}>{unread>99?'99+':unread}</span>}
        </button>
      </div>
      {open&&<NotifDropdown notifications={notifications} unread={unread} bellRef={bellRef} onMarkAll={handleMarkAll} onItemClick={handleItemClick} onViewAll={handleViewAll}/>}
      {detail&&<NotifDetailModal n={detail} onClose={()=>setDetail(null)}/>}
    </>
  )
}
