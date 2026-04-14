export default function StatusPanel({ websites = [] }) {
  const online = websites.filter(w => w.status === 'ONLINE').length
  const offline = websites.filter(w => w.status === 'OFFLINE').length
  const critical = websites.filter(w => w.status === 'CRITICAL').length
  const unknown = websites.filter(w => !w.status || w.status === 'UNKNOWN').length

  const items = [
    { label: 'ONLINE', value: online, color: 'var(--online)' },
    { label: 'OFFLINE', value: offline, color: 'var(--offline)' },
    { label: 'CRITICAL', value: critical, color: 'var(--critical)' },
    { label: 'UNKNOWN', value: unknown, color: 'var(--text-muted)' },
  ]

  return (
    <div className="status-row-wrap">
      <div className="status-row-title">MONITORING STATUS</div>
      <div className="status-row">
        {items.map(item => (
          <div key={item.label} className="status-box" style={{ borderColor: `${item.color}55` }}>
            <div className="status-value" style={{ color: item.color }}>{item.value}</div>
            <div className="status-label" style={{ color: item.color }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
