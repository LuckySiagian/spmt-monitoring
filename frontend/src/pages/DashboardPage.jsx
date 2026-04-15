import { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardAPI, websiteAPI } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import NetworkTopology from '../components/topology/NetworkTopology'
import StatusPanel from '../components/dashboard/StatusPanel'
import ServiceDetailModal from '../components/dashboard/ServiceDetailModal'

export default function DashboardPage({ websites, onWebsitesUpdate, onSummaryUpdate, onNewNotification, wsConnected, setWsConnected, realtimeSnapshot }) {
  const [selectedId, setSelectedId] = useState(null)
  const [detailWebsite, setDetailWebsite] = useState(null)
  const prevStatusRef = useRef({})

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'monitor_update') {
      const p = msg.payload
      const updated = websites.map(w => w.id === p.website_id ? { ...w, status: p.status, status_code: p.status_code, response_time_ms: p.response_time_ms, ssl_valid: p.ssl_valid, last_checked: p.checked_at, ip_address: p.ip_address, root_cause: p.root_cause } : w);
      onWebsitesUpdate?.(updated);
      dashboardAPI.getSummary().then(r => onSummaryUpdate?.(r.data)).catch(() => { })
      setWsConnected?.(true)
    }
    if (msg.type === 'status_change') {
      const p = msg.payload
      onNewNotification?.({ type: p.new_status, name: p.website, websiteId: p.website_id, url: p.url, oldStatus: p.old_status, reason: p.root_cause, ip: p.ip_address, responseTime: p.response_time_ms, ts: Date.now(), read: false })
    }
  }, [websites, onWebsitesUpdate, onSummaryUpdate, onNewNotification])

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
          <StatusPanel websites={websites} selectedId={selectedId} onSelect={setSelectedId} onOpenDetail={handleOpenDetail} realtimeSnapshot={realtimeSnapshot} />
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
