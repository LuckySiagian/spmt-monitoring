import { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardAPI, websiteAPI, incidentAPI } from '../services/api'
import { useGlobalWebSocket } from '../store/WebSocketContext'
import NetworkTopology from '../components/topology/NetworkTopology'
import StatusPanel from '../components/dashboard/StatusPanel'
import { cleanReason } from '../utils/rootCause'

export default function DashboardPage({ websites, onWebsitesUpdate, onSummaryUpdate, onNewNotification, wsConnected, setWsConnected, realtimeSnapshot, onOpenDetail }) {
  const [selectedId, setSelectedId] = useState(null)
  const prevStatusRef = useRef({})
  const lastSummaryFetchRef = useRef(0)
  const [activeIncidents, setActiveIncidents] = useState([])

  const loadActiveIncidents = useCallback(async () => {
    try {
      const res = await incidentAPI.getAll()
      const active = (res.data || []).filter(inc => inc.status !== 'RESOLVED' && inc.status !== 'CLOSED')
      setActiveIncidents(active)
    } catch (e) {}
  }, [])

  useEffect(() => {
    loadActiveIncidents()
    const iv = setInterval(loadActiveIncidents, 10000)
    return () => clearInterval(iv)
  }, [loadActiveIncidents])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'monitor_update') {
      const p = msg.payload
      onWebsitesUpdate?.(prev => {
        const idx = prev.findIndex(w => w.id === p.website_id)
        if (idx === -1) return prev
        const newArr = [...prev]
        newArr[idx] = { 
          ...newArr[idx], 
          status: p.status, 
          status_code: p.status_code, 
          response_time_ms: p.response_time_ms, 
          dns_latency_ms: p.dns_latency_ms,
          tls_latency_ms: p.tls_latency_ms,
          ttfb_latency_ms: p.ttfb_latency_ms,
          health_score: p.health_score,
          confidence: p.confidence,
          is_browser_ok: p.is_browser_ok,
          recommendation: p.recommendation,
          rt_history: [...(newArr[idx].rt_history || []), p.response_time_ms].slice(-10),
          ssl_valid: p.ssl_valid, 
          last_checked: p.checked_at, 
          ip_address: p.ip_address, 
          root_cause: p.root_cause 
        }
        return newArr
      });

      const now = Date.now()
      if (now - lastSummaryFetchRef.current > 2000) {
        lastSummaryFetchRef.current = now
        dashboardAPI.getSummary().then(r => onSummaryUpdate?.(r.data)).catch(() => { })
      }
      setWsConnected?.(true)
    }
    if (msg.type === 'status_change') {
      const p = msg.payload
      onNewNotification?.({ type: p.new_status, name: p.website, websiteId: p.website_id, url: p.url, oldStatus: p.old_status, reason: cleanReason(p.root_cause), ip: p.ip_address, responseTime: p.response_time_ms, ts: Date.now(), read: false })
      loadActiveIncidents()
    }
  }, [onWebsitesUpdate, onSummaryUpdate, onNewNotification, setWsConnected, loadActiveIncidents])

  useGlobalWebSocket(handleWsMessage)
  const handleOpenDetail = useCallback(p => onOpenDetail(websites.find(w => w.id === p.id) || p), [websites, onOpenDetail])

  return (
    <div className="dashboard-page" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="dashboard-grid">
        <div style={s.topo}>
          <NetworkTopology websites={websites} selectedId={selectedId} onSelect={setSelectedId} onOpenDetail={handleOpenDetail} wsConnected={wsConnected} />
        </div>
        <div style={s.status}>
          <StatusPanel 
            websites={websites} 
            selectedId={selectedId} 
            onSelect={setSelectedId} 
            onOpenDetail={handleOpenDetail} 
            realtimeSnapshot={realtimeSnapshot} 
            activeIncidents={activeIncidents}
          />
        </div>
      </div>
    </div>
  )
}

const s = {
  topo: { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  status: { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
}
