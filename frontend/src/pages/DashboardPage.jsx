import { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardAPI, websiteAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import NetworkTopology from '../components/topology/NetworkTopology'
import StatusPanel from '../components/dashboard/StatusPanel'
import ServiceDetailModal from '../components/dashboard/ServiceDetailModal'

export default function DashboardPage({ onSummaryUpdate, onNewNotification, onWebsitesUpdate, refreshTrigger }) {
  const [websites,      setWebsites]      = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  const [wsConnected,   setWsConnected]   = useState(false)
  const [detailWebsite, setDetailWebsite] = useState(null)
  const [realtimeSnap,  setRealtimeSnap]  = useState(null)
  const prevStatusRef = useRef({})

  const loadWebsites = useCallback(async()=>{
    try { const res=await websiteAPI.getAll(); const data=res.data||[]; setWebsites(data); onWebsitesUpdate?.(data); data.forEach(w=>{if(!prevStatusRef.current[w.id])prevStatusRef.current[w.id]=w.status}); pushSnap(data) } catch{}
  },[])

  useEffect(()=>{ loadWebsites(); const iv=setInterval(loadWebsites,60000); return()=>clearInterval(iv) },[loadWebsites])
  useEffect(()=>{ if(refreshTrigger) loadWebsites() },[refreshTrigger,loadWebsites])

  const pushSnap = (list) => setRealtimeSnap({ online:list.filter(w=>w.status==='ONLINE').length, critical:list.filter(w=>w.status==='CRITICAL').length, offline:list.filter(w=>w.status==='OFFLINE').length, unknown:list.filter(w=>!w.status||w.status==='UNKNOWN').length })

  const handleWsMessage = useCallback((msg)=>{
    if(msg.type==='monitor_update'){
      const p=msg.payload
      setWebsites(prev=>{ const up=prev.map(w=>w.id===p.website_id?{...w,status:p.status,status_code:p.status_code,response_time_ms:p.response_time_ms,ssl_valid:p.ssl_valid,last_checked:p.checked_at,ip_address:p.ip_address,root_cause:p.root_cause}:w); pushSnap(up); return up })
      dashboardAPI.getSummary().then(r=>onSummaryUpdate?.(r.data)).catch(()=>{})
      setWsConnected(true)
    }
    if(msg.type==='status_change'){
      const p=msg.payload
      onNewNotification?.({type:p.new_status,name:p.website,websiteId:p.website_id,url:p.url,oldStatus:p.old_status,reason:p.root_cause,ip:p.ip_address,responseTime:p.response_time_ms,ts:Date.now(),read:false})
    }
  },[onSummaryUpdate,onNewNotification])

  useWebSocket(handleWsMessage)
  const handleOpenDetail = useCallback(p=>setDetailWebsite(websites.find(w=>w.id===p.id)||p),[websites])

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Responsive grid — on mobile stacks vertically */}
      <div style={s.main}>
        <div style={s.topo}>
          <NetworkTopology websites={websites} selectedId={selectedId} onSelect={setSelectedId} onOpenDetail={handleOpenDetail} wsConnected={wsConnected}/>
        </div>
        <div style={s.status}>
          <StatusPanel websites={websites} selectedId={selectedId} onSelect={setSelectedId} onOpenDetail={handleOpenDetail} realtimeSnapshot={realtimeSnap}/>
        </div>
      </div>
      {detailWebsite && <ServiceDetailModal website={detailWebsite} onClose={()=>setDetailWebsite(null)}/>}
    </div>
  )
}

const s = {
  main: {
    display:'grid',
    gridTemplateColumns:'72% 28%',
    gap:12, flex:1, overflow:'hidden',
    padding:'16px', minHeight:0,
  },
  topo:   { display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' },
  status: { display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' },
}
