import { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardAPI, websiteAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import NetworkTopology from '../components/topology/NetworkTopology'
import StatusPanel from '../components/dashboard/StatusPanel'
import ServiceDetailModal from '../components/dashboard/ServiceDetailModal'

export default function DashboardPage({ onSummaryUpdate, onNewNotification, onWebsitesUpdate, refreshTrigger }) {
  const [websites, setWebsites] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [detailWebsite, setDetailWebsite] = useState(null)
  const [realtimeSnap, setRealtimeSnap] = useState(null)
  const prevStatusRef = useRef({})

  const summaryTimerRef = useRef(null)

  const requestSummaryUpdate = useCallback(() => {
    if (summaryTimerRef.current) return
    summaryTimerRef.current = setTimeout(async () => {
      try {
        const res = await dashboardAPI.getSummary()
        onSummaryUpdate?.(res.data)
      } catch {
      } finally {
        summaryTimerRef.current = null
      }
    }, 1800)
  }, [onSummaryUpdate])

  const loadWebsites = useCallback(async (signal) => {
    try {
      const res = await websiteAPI.getAll(signal ? { signal } : undefined)
      const data = res.data || []
      setWebsites(data)
      onWebsitesUpdate?.(data)
      data.forEach(w => { if (!prevStatusRef.current[w.id]) prevStatusRef.current[w.id] = w.status })
      pushSnap(data)
    } catch (e) {
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return
    }
  }, [onWebsitesUpdate])

  useEffect(() => {
    const controller = new AbortController()
    loadWebsites(controller.signal)
    const iv = setInterval(() => loadWebsites(controller.signal), 60000)
    return () => {
      controller.abort()
      clearInterval(iv)
    }
  }, [loadWebsites])

  useEffect(() => { if (refreshTrigger) loadWebsites() }, [refreshTrigger, loadWebsites])

  const pushSnap = (list) => setRealtimeSnap({ online: list.filter(w => w.status === 'ONLINE').length, critical: list.filter(w => w.status === 'CRITICAL').length, offline: list.filter(w => w.status === 'OFFLINE').length, unknown: list.filter(w => !w.status || w.status === 'UNKNOWN').length })

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'monitor_update') {
      const p = msg.payload
      setWebsites(prev => {
        const up = prev.map(w => w.id === p.website_id ? { ...w, status: p.status, status_code: p.status_code, response_time_ms: p.response_time_ms, ssl_valid: p.ssl_valid, last_checked: p.checked_at, ip_address: p.ip_address, root_cause: p.root_cause } : w)
        pushSnap(up)
        return up
      })
      requestSummaryUpdate()
      setWsConnected(true)
    }
    if (msg.type === 'status_change') {
      const p = msg.payload
      onNewNotification?.({ type: p.new_status, name: p.website, websiteId: p.website_id, url: p.url, oldStatus: p.old_status, reason: p.root_cause, ip: p.ip_address, responseTime: p.response_time_ms, ts: Date.now(), read: false })
    }
  }, [onNewNotification, requestSummaryUpdate])

  useWebSocket(handleWsMessage)
  const handleOpenDetail = useCallback(p => setDetailWebsite(websites.find(w => w.id === p.id) || p), [websites])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Responsive grid — automatically stacks on mobile via CSS class */}
      <div className="dashboard-grid">
        <div style={s.topo}>
          <NetworkTopology websites={websites} selectedId={selectedId} onSelect={setSelectedId} onOpenDetail={handleOpenDetail} wsConnected={wsConnected} />
        </div>
        <div style={s.status}>
          <StatusPanel websites={websites} selectedId={selectedId} onSelect={setSelectedId} onOpenDetail={handleOpenDetail} realtimeSnapshot={realtimeSnap} />
        </div>
      </div>
      {detailWebsite && <ServiceDetailModal website={detailWebsite} onClose={() => setDetailWebsite(null)} />}
    </div>
  )
}

const s = {
  topo: { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  status: { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
}
