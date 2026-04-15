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
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', backdropFilter: 'blur(10px)', borderRadius:10, padding:'14px 18px', fontSize:14, boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}>
      <div style={{ color:'var(--accent)', marginBottom:8, fontSize:13, fontWeight:800 }}>{label}</div>
      {payload.map(p=>(
        <div key={p.dataKey} style={{ color:p.color, fontWeight:700, marginBottom:4, display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <span>● {p.name}:</span> <span style={{ color:'var(--text)' }}>{p.value??'—'}</span>
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg-header)', flexShrink:0, flexWrap:'wrap', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{ fontSize:13, fontWeight:800, color:'var(--text)', letterSpacing:'0.08em' }}>MONITORING GRAPH</span>
          {loading && <span style={{ color:'var(--accent)', fontSize:12, fontWeight: 700 }}>● LOADING...</span>}
          {range==='live' && !loading && <span style={{ fontSize:10, fontWeight: 800, color:'#10b981', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:6, padding:'2px 10px' }}>● LIVE</span>}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {RANGES.map(r=>(
            <button key={r.value} title={r.desc}
              style={{ background:range===r.value?'var(--accent)':'var(--accent-light)', border:'1px solid var(--border)', color:range===r.value?'#ffffff':'var(--text-sub)', fontSize:11, fontWeight:800, padding:'5px 14px', borderRadius:6, cursor:'pointer', transition:'all 0.15s' }}
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
              <XAxis dataKey="label" tick={{ fill:'var(--text-muted)', fontSize:11, fontWeight:600 }} tickLine={false} axisLine={{ stroke:'var(--border)' }} interval="preserveStartEnd"/>
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:11, fontWeight:600 }} tickLine={false} axisLine={{ stroke:'var(--border)' }} allowDecimals={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Legend wrapperStyle={{ fontSize:12, color:'var(--text-muted)', fontWeight:700, paddingTop:10 }} formatter={v=>(<span style={{ color:'var(--text-sub)' }}>{v.toUpperCase()}</span>)}/>
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
