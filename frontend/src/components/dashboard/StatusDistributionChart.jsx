import {
  RadialBarChart, RadialBar, PolarAngleAxis,
  ResponsiveContainer, Tooltip, Cell,
} from 'recharts'

const COLORS = {
  ONLINE:   '#10b981',
  CRITICAL: '#f59e0b',
  OFFLINE:  '#ef4444',
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const { name, value, percent } = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-main)', border: '1px solid #1e2d4a',
      borderRadius: 8, padding: '8px 12px', fontSize: 11,
    }}>
      <span style={{ color: COLORS[name], fontWeight: 700 }}>{name}</span>
      <span style={{ color: '#e2e8f0', marginLeft: 8 }}>{value} services ({percent}%)</span>
    </div>
  )
}

export default function StatusDistributionChart({ websites }) {
  const total   = websites.length
  const online  = websites.filter(w => w.status === 'ONLINE').length
  const critical = websites.filter(w => w.status === 'CRITICAL').length
  const offline  = websites.filter(w => w.status === 'OFFLINE').length
  const pending  = total - online - critical - offline

  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0

  const data = [
    { name: 'ONLINE',   value: online,   percent: pct(online),   fill: '#10b981' },
    { name: 'CRITICAL', value: critical, percent: pct(critical), fill: '#f59e0b' },
    { name: 'OFFLINE',  value: offline,  percent: pct(offline),  fill: '#ef4444' },
  ].filter(d => d.value > 0)

  // Jika semua 0 (belum ada data)
  const isEmpty = data.length === 0

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ marginRight: 6 }}>
            <circle cx="12" cy="12" r="10" /><polyline points="12 8 12 12 14 14" />
          </svg>
          <span style={styles.title}>STATUS DISTRIBUTION</span>
        </div>
        <span style={styles.totalBadge}>{total} services</span>
      </div>

      {/* Chart + Legend */}
      <div style={styles.body}>
        {isEmpty ? (
          <div style={styles.empty}>Belum ada data service</div>
        ) : (
          <>
            {/* Rose / Radial chart */}
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="20%"
                  outerRadius="85%"
                  data={data}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis
                    type="number"
                    domain={[0, total || 1]}
                    angleAxisId={0}
                    tick={false}
                  />
                  <RadialBar
                    angleAxisId={0}
                    dataKey="value"
                    cornerRadius={6}
                    background={{ fill: 'rgba(30,45,74,0.3)' }}
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </RadialBar>
                  <Tooltip content={<CustomTooltip />} />
                </RadialBarChart>
              </ResponsiveContainer>

              {/* Center label */}
              <div style={styles.centerLabel}>
                <div style={styles.centerValue}>{total}</div>
                <div style={styles.centerText}>Total</div>
              </div>
            </div>

            {/* Legend */}
            <div style={styles.legend}>
              {[
                { label: 'ONLINE',   count: online,   color: '#10b981' },
                { label: 'CRITICAL', count: critical, color: '#f59e0b' },
                { label: 'OFFLINE',  count: offline,  color: '#ef4444' },
                ...(pending > 0 ? [{ label: 'PENDING', count: pending, color: '#4a5568' }] : []),
              ].map(item => (
                <div key={item.label} style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                  <span style={styles.legendLabel}>{item.label}</span>
                  <span style={{ ...styles.legendCount, color: item.color }}>{item.count}</span>
                  <span style={styles.legendPct}>({pct(item.count)}%)</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-main)', border: '1px solid #1e2d4a',
    borderRadius: '8px', overflow: 'hidden',
    width: '100%', flex: 1,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '7px 14px',
    borderBottom: '1px solid #1e2d4a',
    background: 'var(--bg-main)', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center' },
  title: { fontSize: 10, fontWeight: 700, color: '#4a6fa5', letterSpacing: '0.1em' },
  totalBadge: {
    fontSize: 10, color: '#1e3a5f', background: '#0a0e1a',
    padding: '2px 8px', borderRadius: 10,
  },
  body: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '8px',
    overflow: 'hidden',
  },
  chartWrap: {
    position: 'relative',
    width: '100%', flex: 1,
    minHeight: 0,
  },
  centerLabel: {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center', pointerEvents: 'none',
  },
  centerValue: { fontSize: 22, fontWeight: 800, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' },
  centerText: { fontSize: 9, color: '#4a5568', letterSpacing: '0.1em' },
  legend: {
    width: '100%', flexShrink: 0,
    display: 'flex', flexDirection: 'column', gap: 4,
    paddingTop: 4,
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '4px 6px',
    background: 'rgba(30,45,74,0.2)', borderRadius: 5,
  },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', flex: 1 },
  legendCount: { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  legendPct: { fontSize: 10, color: '#4a5568', width: 38, textAlign: 'right' },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#4a5568', fontSize: 12 },
}
