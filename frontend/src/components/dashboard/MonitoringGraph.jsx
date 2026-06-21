import { useState, useEffect, useRef, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { historyAPI } from '../../services/api'
import { useTheme } from '../../store/theme'

// ── Ranges: LIVE (1min), 1H (1min buckets), 3H (2min buckets)
const RANGES = [
  { label:'LIVE', value:'live', bucket:60,  desc:'Real-time per menit' },
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

// ── Build empty live frame: 60 slot @1 menit = pengecekan per menit selama 1 jam
function buildLiveFrame(slots=60) {
  const now = new Date()
  return Array.from({length:slots},(_,i)=>{
    const d = new Date(now.getTime() - (slots-1-i)*60000)
    return { label:d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false}), online:null, critical:null, offline:null, unknown:null }
  })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div style={{
      background:'var(--bg-card)',
      border:'1px solid var(--border-strong, var(--border))',
      backdropFilter: 'blur(14px)',
      borderRadius:12,
      padding:'10px 14px',
      fontSize:13,
      minWidth:150,
      boxShadow:'0 12px 40px rgba(0,0,0,0.32)'
    }}>
      <div style={{ color:'var(--text)', marginBottom:8, fontSize:12, fontWeight:800, letterSpacing:'0.04em', display:'flex', justifyContent:'space-between', gap:16 }}>
        <span>🕒 {label}</span>
        <span style={{ color:'var(--text-muted)' }}>Σ {total}</span>
      </div>
      {payload.map(p=>(
        <div key={p.dataKey} style={{ fontWeight:700, marginBottom:4, display:'flex', justifyContent:'space-between', alignItems:'center', gap:20 }}>
          <span style={{ color:p.color, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, display:'inline-block', flexShrink:0 }} />
            {p.name}
          </span>
          <span style={{ color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>{p.value??'—'}</span>
        </div>
      ))}
    </div>
  )
}

const MAX_LIVE = 60

export default function MonitoringGraph({ realtimeSnapshot }) {
  const { t } = useTheme()
  const [range,    setRange]   = useState('live')
  const [data,     setData]    = useState([])
  const [loading,  setLoading] = useState(false)
  const [mounted,  setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  // ── Sumbu Y: default 0–300 (garis tiap 50). Jika data >300, otomatis 0–500 (garis tiap 100) ──
  const dataPeak = data.reduce((m, d) => Math.max(m, d.online ?? 0, d.critical ?? 0, d.offline ?? 0), 0)
  const yMax  = dataPeak > 300 ? 500 : 300
  const yStep = dataPeak > 300 ? 100 : 50
  const yTicks = Array.from({ length: yMax / yStep + 1 }, (_, i) => i * yStep)

  // ── Keterangan garis grafik (ikut bahasa terpilih) ──
  const LEGEND = [
    { label: t.online,   color: '#10b981' },
    { label: t.critical, color: '#d97706' },
    { label: t.offline,  color: '#dc2626' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'transparent' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg-header)', flexShrink:0, gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{ fontSize:13, fontWeight:900, color:'var(--text)', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{t.monitoringStatus}</span>
          {loading && <span style={{ color:'var(--accent)', fontSize:11, fontWeight: 800, animation: 'pulse 1.5s infinite' }}>{t.loadingCaps}</span>}
          {range==='live' && !loading && <span style={{ fontSize:10, fontWeight: 900, color:'#10b981', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:6, padding:'2px 10px', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}><span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', display:'inline-block', animation:'pulse 1.5s infinite' }} />{t.liveCaps}</span>}
        </div>
      </div>

      {/* Chart — dipusatkan dengan jarak di semua sisi */}
      <div style={{ flex:1, minHeight:0, padding:'14px 16px' }}>
        {data.length===0 && !loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:'var(--text-muted)' }}>
            <span style={{ fontSize:24 }}>📊</span>
            <span style={{ fontSize:11 }}>{t.waitingData}</span>
          </div>
        ) : (
          mounted && (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 400, height: 200 }}>
              <AreaChart data={data} margin={{ top:6, right:12, left:-6, bottom:4 }}>
                <defs>
                  <linearGradient id="gOn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.45}/><stop offset="95%" stopColor="#10b981" stopOpacity={0.02}/></linearGradient>
                  <linearGradient id="gCr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d97706" stopOpacity={0.4}/><stop offset="95%" stopColor="#d97706" stopOpacity={0.02}/></linearGradient>
                  <linearGradient id="gOf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dc2626" stopOpacity={0.45}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0.02}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" vertical={false}/>
                <XAxis dataKey="label" tick={{ fill:'var(--text-muted)', fontSize:11, fontWeight:600 }} tickLine={false} axisLine={{ stroke:'var(--border)' }} interval="preserveStartEnd" minTickGap={40}/>
                <YAxis domain={[0, yMax]} ticks={yTicks} tick={{ fill:'var(--text-muted)', fontSize:11, fontWeight:600 }} tickLine={false} axisLine={{ stroke:'var(--border)' }} allowDecimals={false} width={34}/>
                <Tooltip content={<CustomTooltip/>} cursor={{ stroke:'var(--accent)', strokeWidth:1, strokeDasharray:'4 4' }}/>
                <Area type="monotone" dataKey="online"   name={t.online}   stroke="#10b981" strokeWidth={2.6} fill="url(#gOn)" dot={false} activeDot={{ r:5, strokeWidth:2, stroke:'var(--bg-card)' }} connectNulls={false} isAnimationActive={false}/>
                <Area type="monotone" dataKey="critical" name={t.critical} stroke="#d97706" strokeWidth={2.4} fill="url(#gCr)" dot={false} activeDot={{ r:5, strokeWidth:2, stroke:'var(--bg-card)' }} connectNulls={false} isAnimationActive={false}/>
                <Area type="monotone" dataKey="offline"  name={t.offline}  stroke="#dc2626" strokeWidth={2.6} fill="url(#gOf)" dot={false} activeDot={{ r:5, strokeWidth:2, stroke:'var(--bg-card)' }} connectNulls={false} isAnimationActive={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )

        )}
      </div>

      {/* Keterangan garis: tiap warna mewakili jumlah node pada status tsb */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexWrap:'wrap', columnGap:16, rowGap:6, padding:'6px 14px 10px', flexShrink:0 }}>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:16, height:3, borderRadius:2, background:l.color, display:'inline-block', flexShrink:0 }} />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--text-sub)' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
