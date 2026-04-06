import { useEffect, useRef, useState } from 'react'

const STATUS_COLORS = {
  ONLINE: '#10b981',
  CRITICAL: '#f59e0b',
  OFFLINE: '#ef4444',
}

// Mini sparkline for a website
const Sparkline = ({ logs }) => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !logs?.length) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const maxRT = Math.max(...logs.map(l => l.response_time_ms || 0), 1000)
    const step = width / Math.max(logs.length - 1, 1)

    ctx.beginPath()
    logs.forEach((log, i) => {
      const x = i * step
      const y = height - ((log.response_time_ms || 0) / maxRT) * height * 0.8 - 2
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Color dots by status
    logs.forEach((log, i) => {
      const x = i * step
      ctx.beginPath()
      ctx.arc(x, height - 3, 2, 0, Math.PI * 2)
      ctx.fillStyle = STATUS_COLORS[log.status] || '#4a5568'
      ctx.fill()
    })
  }, [logs])

  return <canvas ref={canvasRef} width={80} height={28} style={{ display: 'block' }} />
}

// Uptime bar for a website (24h blocks)
const UptimeBar = ({ website, logs }) => {
  const BLOCKS = 48
  const blocks = Array(BLOCKS).fill('empty')

  if (logs?.length) {
    const now = Date.now()
    const windowMs = 24 * 60 * 60 * 1000
    const blockMs = windowMs / BLOCKS

    logs.forEach(log => {
      const t = new Date(log.checked_at).getTime()
      const idx = Math.floor((now - t) / blockMs)
      if (idx >= 0 && idx < BLOCKS) {
        const revIdx = BLOCKS - 1 - idx
        if (blocks[revIdx] === 'empty' || log.status === 'OFFLINE' ||
          (log.status === 'CRITICAL' && blocks[revIdx] === 'ONLINE')) {
          blocks[revIdx] = log.status
        }
      }
    })
  }

  const uptime = logs?.length
    ? Math.round((logs.filter(l => l.status === 'ONLINE').length / logs.length) * 100)
    : null

  return (
    <div style={styles.uptimeRow}>
      <div style={styles.uptimeName} title={website.name}>{website.name}</div>
      <div style={styles.blocks}>
        {blocks.map((status, i) => (
          <div
            key={i}
            style={{
              ...styles.block,
              background: status === 'ONLINE' ? '#10b981'
                : status === 'CRITICAL' ? '#f59e0b'
                : status === 'OFFLINE' ? '#ef4444'
                : 'var(--border)',
              opacity: status === 'empty' ? 0.3 : 1,
            }}
            title={status}
          />
        ))}
      </div>
      <div style={styles.uptimePct}>
        {uptime != null ? `${uptime}%` : '—'}
      </div>
      <div style={styles.sparkContainer}>
        <Sparkline logs={logs} />
      </div>
    </div>
  )
}

// Alert ticker
const AlertTicker = ({ websites }) => {
  const alerts = websites.filter(w => w.status === 'OFFLINE' || w.status === 'CRITICAL')

  const messages = alerts.length
    ? alerts.map(w => `⚠ ${w.name.toUpperCase()} IS ${w.status}  ·  ${w.url}`)
    : ['✓ ALL SYSTEMS OPERATIONAL  ·  NO ALERTS DETECTED']

  const text = messages.join('     ·     ')

  return (
    <div style={styles.ticker}>
      <div style={styles.tickerLabel}>ALERTS</div>
      <div style={styles.tickerTrack}>
        <div
          style={{
            ...styles.tickerContent,
            color: alerts.length > 0 ? '#ef4444' : '#10b981',
            animationDuration: `${Math.max(20, text.length * 0.15)}s`,
          }}
        >
          {text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{text}
        </div>
      </div>
    </div>
  )
}

export default function BottomStrip({ websites, logsMap }) {
  return (
    <div style={styles.strip}>
      {/* Uptime bars */}
      <div style={styles.uptimeSection}>
        <div style={styles.sectionLabel}>24H UPTIME</div>
        <div style={styles.uptimeList}>
          {websites.slice(0, 6).map(w => (
            <UptimeBar key={w.id} website={w} logs={logsMap?.[w.id] || []} />
          ))}
          {websites.length === 0 && (
            <div style={{ color: '#2d4a6a', fontSize: 11, padding: '8px' }}>No data</div>
          )}
        </div>
      </div>

      {/* Alert ticker */}
      <AlertTicker websites={websites} />
    </div>
  )
}

const styles = {
  strip: {
    flexShrink: 0,
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-main)', borderTop: '1px solid #1e2d4a',
    height: '110px',
  },
  uptimeSection: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    padding: '6px 16px 0',
    flex: 1,
  },
  sectionLabel: {
    fontSize: '9px', color: '#2d4a6a', letterSpacing: '0.1em',
    fontWeight: '600', marginTop: '2px', flexShrink: 0,
    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
    paddingBottom: '4px',
  },
  uptimeList: {
    display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflow: 'hidden',
  },
  uptimeRow: {
    display: 'flex', alignItems: 'center', gap: '8px', height: '16px',
  },
  uptimeName: {
    width: '100px', fontSize: '10px', color: '#4a6fa5',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  blocks: {
    display: 'flex', gap: '1px', flex: 1, alignItems: 'center',
  },
  block: {
    width: '100%', height: '10px', borderRadius: '1px', flexShrink: 0,
    maxWidth: '14px',
  },
  uptimePct: {  
    width: '36px', fontSize: '10px', color: '#10b981',
    textAlign: 'right', flexShrink: 0, fontWeight: '600',
  },
  sparkContainer: {
    width: '80px', flexShrink: 0,
  },
  ticker: {
    display: 'flex', alignItems: 'center',
    borderTop: '1px solid #1a2438',
    height: '24px', overflow: 'hidden',
    flexShrink: 0,
  },
  tickerLabel: {
    fontSize: '9px', fontWeight: '700', letterSpacing: '0.1em',
    color: '#2d4a6a', background: '#0a0e1a',
    padding: '0 10px', height: '100%',
    display: 'flex', alignItems: 'center', flexShrink: 0,
    borderRight: '1px solid #1a2438',
  },
  tickerTrack: {
    flex: 1, overflow: 'hidden', position: 'relative',
  },
  tickerContent: {
    whiteSpace: 'nowrap', fontSize: '10px', letterSpacing: '0.05em',
    fontWeight: '500',
    animation: 'ticker linear infinite',
    display: 'inline-block',
    padding: '0 16px',
  },
}
