import { useTheme } from '../store/theme'

const SC = { ONLINE:'#10b981', CRITICAL:'#f59e0b', OFFLINE:'#ef4444', SERVER_DOWN:'#dc2626', WEB_DOWN:'#f97316', DNS_ERROR:'#8b5cf6', SSL_INVALID:'#ec4899', SLOW:'#eab308' }
const SB = { ONLINE:'rgba(16,185,129,0.12)', CRITICAL:'rgba(245,158,11,0.12)', OFFLINE:'rgba(239,68,68,0.12)' }

const StatusBadge = ({ s }) => (
  <span style={{ background:SB[s]||'rgba(74,85,104,0.12)', color:SC[s]||'#64748b', border:`1px solid ${SC[s]||'#64748b'}44`, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{s}</span>
)

export default function NotificationsPage({ notifications=[], onDelete, onClearAll }) {
  const { t: tr } = useTheme()
  const fmtTime = d => d ? new Date(d).toLocaleString('id-ID',{hour12:false}) : '—'

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* FIX 6: Judul + subtitle + clear all dalam header tabel */}
        <div style={s.head}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:15, fontWeight:800, color:'#e5e7eb', letterSpacing:'0.04em' }}>🔔 All Notifications</span>
            <span style={{ fontSize:11, color:'#64748b' }}>Status change events in this session ({notifications.length} events)</span>
          </div>
          {notifications.length > 0 && (
            <button onClick={onClearAll}
              style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', borderRadius:6, padding:'6px 14px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {tr?.clearAll||'Clear All'}
            </button>
          )}
        </div>

        {/* Table */}
        {notifications.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize:32, marginBottom:12, opacity:0.4 }}>🔔</div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:13 }}>No notifications this session.</div>
            <div style={{ color:'rgba(255,255,255,0.2)', fontSize:11, marginTop:6 }}>Status changes will appear here in real-time.</div>
          </div>
        ) : (
          <div style={{ flex:1, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>{['Service','Transition','Root Cause','Response','Time',''].map(h=>(
                  <th key={h} style={s.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {notifications.map((n,i) => (
                  <tr key={i} style={{ background:!n.read?'rgba(59,130,246,0.05)':'transparent', transition:'background 0.1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background=!n.read?'rgba(59,130,246,0.05)':'transparent'}>
                    <td style={{ ...s.td, fontWeight:600 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {!n.read && <span style={{ width:6, height:6, borderRadius:'50%', background:'#3b82f6', flexShrink:0 }}/>}
                        <span style={{ color:'#e2e8f0' }}>{n.name}</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      {n.oldStatus && <><span style={{ color:SC[n.oldStatus]||'#64748b', fontSize:11 }}>{n.oldStatus}</span><span style={{ color:'rgba(255,255,255,0.2)', margin:'0 6px' }}>→</span></>}
                      <StatusBadge s={n.type} />
                    </td>
                    <td style={{ ...s.td, color:'#64748b', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.reason||'—'}</td>
                    <td style={{ ...s.td, color:n.responseTime>3000?'#f59e0b':'#10b981' }}>
                      {n.responseTime!=null?`${n.responseTime}ms`:'—'}
                    </td>
                    <td style={{ ...s.td, color:'#64748b', fontSize:11 }}>{fmtTime(n.ts)}</td>
                    <td style={s.td}>
                      <button onClick={()=>onDelete?.(i)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.2)', cursor:'pointer', fontSize:14, padding:'0 4px' }} title="Hapus">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  page: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'8px 10px' },
  card: { background:'rgba(5,10,25,0.55)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, overflow:'hidden', flex:1, display:'flex', flexDirection:'column' },
  head: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', background:'rgba(0,0,0,0.2)', flexShrink:0, flexWrap:'wrap', gap:8 },
  th: { textAlign:'left', padding:'10px 14px', fontSize:9, color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em', borderBottom:'1px solid rgba(255,255,255,0.06)', fontWeight:700, background:'rgba(0,0,0,0.15)', position:'sticky', top:0 },
  td: { padding:'10px 14px', color:'var(--text-muted)', borderBottom:'1px solid rgba(255,255,255,0.04)', fontVariantNumeric:'tabular-nums' },
  empty: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 0' },
}
