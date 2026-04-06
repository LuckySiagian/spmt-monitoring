import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from '../../store/theme'

const STATUS_COLORS = {
  ONLINE: '#10b981', CRITICAL: '#f59e0b', OFFLINE: '#ef4444', UNKNOWN: '#4a5568',
}
const STATUS_GLOW = {
  ONLINE: 'rgba(16,185,129,0.4)', CRITICAL: 'rgba(245,158,11,0.6)',
  OFFLINE: 'rgba(239,68,68,0.4)', UNKNOWN: 'rgba(74,85,104,0.2)',
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '148,163,184'
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

// ── Layout functions ──────────────────────────────────────────

function calcStarLayout(websites) {
  return websites.map((w, i) => {
    const angle = (i / Math.max(websites.length, 1)) * Math.PI * 2 - Math.PI / 2
    const radius = Math.min(0.42, 0.20 + websites.length * 0.010)
    return {
      id: w.id, name: w.name, url: w.url, status: w.status || 'UNKNOWN',
      x: 0.5 + radius * Math.cos(angle),
      y: 0.5 + radius * Math.sin(angle),
    }
  })
}

function calcTreeLayout(websites) {
  const n = websites.length
  if (n === 0) return []

  // Hierarchical fan-tree layout:
  // Server = root at bottom-center (y=0.88)
  // Websites = leaves distributed in rows from top (y≈0.10) downward
  // Each row fills left-to-right, evenly spaced

  const MAX_PER_ROW = Math.max(3, Math.ceil(Math.sqrt(n * 1.6)))
  const rows = []
  let remaining = n

  while (remaining > 0) {
    const rowSize = Math.min(MAX_PER_ROW, remaining)
    rows.push(rowSize)
    remaining -= rowSize
  }

  const result = []
  const totalRows = rows.length
  let idx = 0

  rows.forEach((rowSize, ri) => {
    // y: first row at 0.10, spread to 0.46 max
    const y = totalRows === 1 ? 0.22 : 0.10 + (ri / (totalRows - 1)) * 0.36

    for (let ci = 0; ci < rowSize; ci++) {
      const w = websites[idx++]
      // x: evenly distributed with padding
      const xPad  = 0.08
      const xSpan = 1 - xPad * 2
      const x = rowSize === 1 ? 0.5 : xPad + (ci / (rowSize - 1)) * xSpan

      result.push({
        id: w.id, name: w.name, url: w.url, status: w.status || 'UNKNOWN',
        x: Math.min(0.92, Math.max(0.08, x)),
        y: Math.min(0.50, Math.max(0.08, y)),
        rowIdx: ri,
      })
    }
  })

  return result
}

export default function NetworkTopology({ websites, selectedId, onSelect, onOpenDetail, wsConnected }) {
  const { themeId } = useTheme()
  const canvasRef    = useRef(null)
  const animFrameRef = useRef(null)
  const timeRef      = useRef(0)
  const faviconCache = useRef({})
  const [nodes,   setNodes]   = useState([])
  const [topoMode, setMode]   = useState('star') // 'star' | 'tree'

  // Preload favicons
  useEffect(() => {
    websites.forEach(w => {
      const domain = getDomain(w.url)
      if (!faviconCache.current[domain]) {
        const img = new Image()
        img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
        img.onload  = () => { faviconCache.current[domain] = img }
        img.onerror = () => { faviconCache.current[domain] = null }
      }
    })
  }, [websites])

  // Recalc layout when websites or mode changes
  useEffect(() => {
    setNodes(topoMode === 'tree' ? calcTreeLayout(websites) : calcStarLayout(websites))
  }, [websites, topoMode])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    timeRef.current += 0.018
    ctx.clearRect(0, 0, width, height)

    // Background grid
    ctx.strokeStyle = 'rgba(99,102,241,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }

    // Server position
    const serverX = topoMode === 'tree' ? width * 0.5 : width * 0.5
    const serverY = topoMode === 'tree' ? height * 0.88 : height * 0.5

    // Draw connections + data packets
    nodes.forEach(node => {
      const nx = node.x * width, ny = node.y * height
      const color = STATUS_COLORS[node.status] || STATUS_COLORS.UNKNOWN
      const isSel = node.id === selectedId

      const alpha = node.status === 'ONLINE' ? 0.28 : 0.18
      ctx.beginPath()
      ctx.moveTo(nx, ny)
      if (topoMode === 'tree') {
        // Bezier curve: from node upward to server at bottom
        const cpY1 = ny + (serverY - ny) * 0.4
        const cpY2 = serverY - (serverY - ny) * 0.4
        ctx.bezierCurveTo(nx, cpY1, serverX, cpY2, serverX, serverY)
      } else {
        ctx.lineTo(serverX, serverY)
      }
      ctx.strokeStyle = isSel ? color : `rgba(${hexToRgb(color)},${alpha})`
      ctx.lineWidth = isSel ? 2.5 : 1.2
      ctx.setLineDash([])
      ctx.stroke()

      // Animated data packet along path
      if (node.status === 'ONLINE' || node.status === 'CRITICAL') {
        const speed = node.status === 'CRITICAL' ? 1.8 : 0.8
        const t2 = (timeRef.current * speed + node.x * 3 + node.y * 2) % 1
        let px, py
        if (topoMode === 'tree') {
          // Bezier interpolation
          const cpY1 = ny + (serverY - ny) * 0.4
          const cpY2 = serverY - (serverY - ny) * 0.4
          const mt = 1 - t2
          px = mt*mt*mt*nx + 3*mt*mt*t2*nx + 3*mt*t2*t2*serverX + t2*t2*t2*serverX
          py = mt*mt*mt*ny + 3*mt*mt*t2*cpY1 + 3*mt*t2*t2*cpY2 + t2*t2*t2*serverY
        } else {
          px = nx + (serverX - nx) * t2
          py = ny + (serverY - ny) * t2
        }
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
    })

    // Server node
    const pulse = Math.sin(timeRef.current * 2) * 0.3 + 0.7
    ctx.beginPath(); ctx.arc(serverX, serverY, 38, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(59,130,246,${pulse * 0.15})`; ctx.fill()
    ctx.beginPath(); ctx.arc(serverX, serverY, 28, 0, Math.PI * 2)
    ctx.fillStyle = 'var(--bg-main)'; ctx.fill()
    ctx.strokeStyle = `rgba(59,130,246,${pulse})`; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#3b82f6'; ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('SPMT', serverX, serverY - 4)
    ctx.font = '10px monospace'; ctx.fillStyle = '#4a6fa5'
    ctx.fillText('SERVER', serverX, serverY + 6)

    // Website nodes
    nodes.forEach(node => {
      const nx = node.x * width, ny = node.y * height
      const color = STATUS_COLORS[node.status] || STATUS_COLORS.UNKNOWN
      const glow  = STATUS_GLOW[node.status]  || STATUS_GLOW.UNKNOWN
      const isSel = node.id === selectedId
      const isCrit = node.status === 'CRITICAL'
      const r = isSel ? 28 : 24

      // Critical pulse ring
      if (isCrit) {
        const p = Math.abs(Math.sin(timeRef.current * 3))
        ctx.beginPath(); ctx.arc(nx, ny, r + 12 * p, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(245,158,11,${0.12 * p})`; ctx.fill()
      }

      // Glow halo
      const hPulse = Math.sin(timeRef.current * 1.5 + node.x * 10) * 0.4 + 0.6
      ctx.beginPath(); ctx.arc(nx, ny, r + 8, 0, Math.PI * 2)
      ctx.fillStyle = glow.replace('0.4', String((isCrit ? 0.25 : 0.12) * hPulse)); ctx.fill()

      // Node body
      ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(248,250,252,0.95)'; ctx.fill()
      ctx.strokeStyle = color; ctx.lineWidth = isSel ? 2.5 : isCrit ? 2 : 1.5; ctx.stroke()

      // Favicon / initial
      const domain  = getDomain(node.url)
      const favicon = faviconCache.current[domain]
      const imgSize = r * 1.55 | 0  // ~r*1.55 — almost fills the circle
      if (favicon) {
        try {
          ctx.save()
          const half = imgSize/2; ctx.beginPath(); ctx.arc(nx, ny - 2, half + 1, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(favicon, nx - half, ny - 2 - half, imgSize, imgSize)
          ctx.restore()
        } catch { drawInitial(ctx, node.name, nx, ny) }
      } else {
        drawInitial(ctx, node.name, nx, ny)
      }

      // Name label
      const name = node.name.length > 11 ? node.name.slice(0, 10) + '…' : node.name
      const labelY = ny + r + 6
      ctx.font = `${isSel ? '800 ' : '600 '}12px system-ui`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      const tw = ctx.measureText(name).width + 12
      const isLight = themeId === 'theme-light'

      ctx.fillStyle = isLight ? 'rgba(255,255,255,1)' : 'rgba(10,14,26,0.9)'
      ctx.fillRect(nx - tw / 2, labelY - 2, tw, 18)
      ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.2)' : 'transparent'
      if (isLight) ctx.strokeRect(nx - tw / 2, labelY - 2, tw, 18)

      ctx.fillStyle = isLight 
        ? '#000000' 
        : (isSel ? '#e2e8f0' : 'var(--text-muted)')
      ctx.fillText(name, nx, labelY)

      // Status dot
      ctx.beginPath(); ctx.arc(nx + r - 4, ny - r + 4, 4, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
    })

    animFrameRef.current = requestAnimationFrame(draw)
  }, [nodes, selectedId, topoMode])

  function drawInitial(ctx, name, nx, ny) {
    ctx.fillStyle = '#3b82f6'
    ctx.font = 'bold 15px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((name || 'W')[0].toUpperCase(), nx, ny - 2)
  }

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [draw])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    return () => ro.disconnect()
  }, [])

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { width, height } = canvas
    for (const node of nodes) {
      const nx = node.x * width, ny = node.y * height
      if (Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2) < 32) {
        onSelect?.(node.id === selectedId ? null : node.id)
        onOpenDetail?.({ id: node.id, name: node.name, url: node.url, status: node.status })
        return
      }
    }
    onSelect?.(null)
  }, [nodes, selectedId, onSelect, onOpenDetail])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', backdropFilter: 'blur(10px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: 1, position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ marginRight: 8, filter: 'drop-shadow(0 0 4px var(--accent))' }}>
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="8" /><line x1="12" y1="16" x2="12" y2="22" />
          </svg>
          NETWORK TOPOLOGY
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Topology mode toggle */}
          <div style={{ display: 'flex', background: 'var(--accent-light)', border: `1px solid var(--border)`, borderRadius: 6, overflow: 'hidden' }}>
            {['star', 'tree'].map(m => (
              <button
                key={m}
                style={{
                  background: topoMode === m ? 'rgba(59,130,246,0.2)' : 'transparent',
                  border: 'none',
                  color: topoMode === m ? '#3b82f6' : '#4a5568',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                  padding: '3px 10px', cursor: 'pointer', transition: 'all 0.15s',
                  borderRight: m === 'star' ? `1px solid var(--border)` : 'none',
                }}
                onClick={() => setMode(m)}
              >
                {m === 'star' ? '✦ STAR' : '⑂ TREE'}
              </button>
            ))}
          </div>

          {/* Node count */}
          <span style={{ fontSize: 10, color: 'var(--text-sub)', background: 'var(--accent-light)', padding: '2px 8px', borderRadius: 10 }}>
            {nodes.length} nodes
          </span>

          {/* LIVE badge */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color:      wsConnected ? '#10b981' : '#f59e0b',
            background: wsConnected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            border: '1px solid ' + (wsConnected ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'),
            borderRadius: 10, padding: '2px 8px',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: wsConnected ? '#10b981' : '#f59e0b' }} />
            {wsConnected ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>
      </div>

      {/* Canvas Layer & Radar */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Radar Animations */}
        <div style={{ position:'absolute', top: topoMode==='tree'?'88%':'50%', left:'50%', width:'200%', height:'200%', background:'conic-gradient(from 0deg, transparent 70%, rgba(99,102,241,0.15) 100%)', borderRadius:'50%', pointerEvents:'none', animation:'radarSweep 4s linear infinite', zIndex:0 }} />
        <div style={{ position:'absolute', top: topoMode==='tree'?'88%':'50%', left:'50%', transform:'translate(-50%, -50%)', width:'200%', height:'200%', background:'radial-gradient(circle, transparent 10%, rgba(99,102,241,0.05) 11%, transparent 12%, transparent 20%, rgba(99,102,241,0.05) 21%, transparent 22%, transparent 30%, rgba(99,102,241,0.05) 31%, transparent 32%)', pointerEvents:'none', zIndex:0 }}/>

        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', position:'relative', zIndex:1 }}
          onClick={handleClick}
          onMouseMove={(e) => {
            const canvas = canvasRef.current
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const mx = e.clientX - rect.left, my = e.clientY - rect.top
            const { width, height } = canvas
            const hovered = nodes.some(n => Math.sqrt((mx - n.x * width) ** 2 + (my - n.y * height) ** 2) < 32)
            canvas.style.cursor = hovered ? 'pointer' : 'default'
          }}
        />
      </div>

      {nodes.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
          <div style={{ color: '#4a5568', fontSize: 13 }}>No websites monitored</div>
          <div style={{ color: '#1e3a5f', fontSize: 11, marginTop: 4 }}>Add websites to begin monitoring</div>
        </div>
      )}
    </div>
  )
}
