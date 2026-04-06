import { useState, useEffect, useRef, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { historyAPI } from '../../services/api'

// ── Ranges: LIVE (1min), 1H (1min buckets), 3H (2min buckets)
const RANGES = [
  { label:'LIVE', value:'live', bucket:60,  desc:'Real-time per menit' },
  { label:'1H',   value:'1h',   bucket:60,  desc:'1 Jam — data per menit' },
  { label:'3H',   value:'3h',   bucket:120, desc:'3 Jam — data per 2 menit' },
]

// ── Safe date formatter — TIDAK PERNAH return Invalid Date / tahun 2000
function safeLabel(timeVal, bucket) {
  if (!timeVal) return ''
  let d
  // Handle berbagai format dari backend: ISO string, epoch number, timestamp
  if (typeof timeVal === 'number') {
    // Jika epoch dalam detik (< 1e10), konversi ke ms
    d = new Date(timeVal < 1e10 ? timeVal * 1000 : timeVal)
  } else {
    d = new Date(timeVal)
  }
  // Validasi — jika invalid atau tahun < 2020, pakai waktu sekarang
  if (isNaN(d.getTime()) || d.getFullYear() < 2020) return ''
  return d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false })
}

// ── Build empty live frame (60 slots per-menit terakhir)
function buildLiveFrame(slots=60) {
  const now = new Date()
  return Array.from({length:slots},(_,i)=>{
    const d = new Date(now.getTime() - (slots-1-i)*60000)
    return { label:d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false}), online:null, critical:null, offline:null, unknown:null }
  })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'rgba(255,255,255,0.96)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:8, padding:'10px 14px', fontSize:11, boxShadow:'0 4px 16px rgba(99,102,241,0.15)' }}>
      <div style={{ color:'#6366f1', marginBottom:6, fontSize:10, fontWeight:700 }}>{label}</div>
      {payload.map(p=>(
        <div key={p.dataKey} style={{ color:p.color, fontWeight:600, marginBottom:2 }}>
          ● {p.name}: <span style={{ color:'var(--text)' }}>{p.value??'—'}</span>
        </div>
      ))}
    </div>
  )
}

const MAX_LIVE = 60

export default function MonitoringGraph({ realtimeSnapshot }) {
  const [range,    setRange]   = useState('live')
  const [data,     setData]    = useState([])
  const [loading,  setLoading] = useState(false)

  const liveRef   = useRef(buildLiveFrame(MAX_LIVE))
  const bucketRef = useRef({})

  // ── Init: backfill live dari DB (1h history) ──
  useEffect(()=>{
    const init = async () => {
      try {
        const res = await historyAPI.getStatusHistory('1h')
        const pts = res.data || []
        const frame = buildLiveFrame(MAX_LIVE)
        pts.forEach(p => {
          const lbl = safeLabel(p.time, 60)
          if (!lbl) return
          const idx = frame.findIndex(f=>f.label===lbl)
          if (idx !== -1) {
            frame[idx] = { label:lbl, online:p.online??0, critical:p.critical??0, offline:p.offline??0, unknown:p.unknown??0 }
          }
        })
        liveRef.current = frame
        setData([...frame])
      } catch { setData([...liveRef.current]) }
    }
    init()
  },[])

  // ── Fetch 1H / 3H dari DB ──
  const fetchHistory = useCallback(async (r) => {
    setLoading(true)
    try {
      const res = await historyAPI.getStatusHistory(r)
      const pts = (res.data||[])
        .map(p => ({ label:safeLabel(p.time, r==='3h'?120:60), online:p.online??0, critical:p.critical??0, offline:p.offline??0, unknown:p.unknown??0 }))
        .filter(p => p.label) // buang yang labelnya kosong/invalid
      setData(pts)
    } catch { setData([]) }
    finally { setLoading(false) }
  },[])

  // ── Switch range ──
  useEffect(()=>{
    if (range==='live') setData([...liveRef.current])
    else fetchHistory(range)
  },[range, fetchHistory])

  // ── Live update dari WebSocket snapshot ──
  useEffect(()=>{
    if (!realtimeSnapshot) return
    const now  = new Date()
    const lbl  = now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})
    const snap = { online:realtimeSnapshot.online??0, critical:realtimeSnapshot.critical??0, offline:realtimeSnapshot.offline??0, unknown:realtimeSnapshot.unknown??0 }
    bucketRef.current[lbl] = snap

    let frame = liveRef.current.map(p => p.label===lbl ? {...p,...snap} : p)
    if (!frame.find(p=>p.label===lbl)) {
      frame = [...frame.slice(1), {label:lbl,...snap}]
    }
    liveRef.current = frame
    if (range==='live') setData([...frame])
  },[realtimeSnapshot, range])

  const activeRange = RANGES.find(r=>r.value===range)

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'transparent' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 12px', borderBottom:'1px solid rgba(99,102,241,0.1)', background:'rgba(255,255,255,0.6)', flexShrink:0, flexWrap:'wrap', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{ fontSize:10, fontWeight:700, color:'var(--text-sub)', letterSpacing:'0.08em' }}>MONITORING GRAPH</span>
          {loading && <span style={{ color:'#6366f1', fontSize:9 }}>● LOADING...</span>}
          {range==='live' && !loading && <span style={{ fontSize:9, color:'#059669', background:'rgba(5,150,105,0.1)', border:'1px solid rgba(5,150,105,0.3)', borderRadius:4, padding:'1px 7px' }}>● LIVE · per menit</span>}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {RANGES.map(r=>(
            <button key={r.value} title={r.desc}
              style={{ background:range===r.value?'rgba(79,70,229,0.12)':'transparent', border:range===r.value?'1px solid rgba(79,70,229,0.4)':'1px solid rgba(99,102,241,0.2)', color:range===r.value?'#4f46e5':'var(--text-muted)', fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4, cursor:'pointer', transition:'all 0.15s' }}
              onClick={()=>setRange(r.value)}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex:1, padding:'8px 4px 4px', minHeight:0 }}>
        {data.length===0 && !loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)' }}>
            <span style={{ fontSize:24 }}>📊</span>
            <span style={{ fontSize:11 }}>Menunggu data...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top:6, right:12, left:-14, bottom:0 }}>
              <defs>
                <linearGradient id="gOn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.3}/><stop offset="95%" stopColor="#059669" stopOpacity={0.02}/></linearGradient>
                <linearGradient id="gCr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d97706" stopOpacity={0.3}/><stop offset="95%" stopColor="#d97706" stopOpacity={0.02}/></linearGradient>
                <linearGradient id="gOf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0.02}/></linearGradient>
                <linearGradient id="gUn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/><stop offset="95%" stopColor="#94a3b8" stopOpacity={0.01}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.08)"/>
              <XAxis dataKey="label" tick={{ fill:'var(--text-muted)', fontSize:8 }} tickLine={false} axisLine={{ stroke:'rgba(99,102,241,0.15)' }} interval="preserveStartEnd"/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:9 }} tickLine={false} axisLine={{ stroke:'rgba(99,102,241,0.15)' }} allowDecimals={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Legend wrapperStyle={{ fontSize:9, color:'#64748b', paddingTop:4 }} formatter={v=>v.toUpperCase()}/>
              <Area type="monotone" dataKey="online"   name="Online"   stroke="#059669" strokeWidth={2} fill="url(#gOn)" dot={false} activeDot={{r:4}} connectNulls={false}/>
              <Area type="monotone" dataKey="critical" name="Critical" stroke="#d97706" strokeWidth={2} fill="url(#gCr)" dot={false} activeDot={{r:4}} connectNulls={false}/>
              <Area type="monotone" dataKey="offline"  name="Offline"  stroke="#dc2626" strokeWidth={2} fill="url(#gOf)" dot={false} activeDot={{r:4}} connectNulls={false}/>
              <Area type="monotone" dataKey="unknown"  name="Unknown"  stroke="#94a3b8" strokeWidth={1.5} fill="url(#gUn)" dot={false} activeDot={{r:3}} connectNulls={false}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
