import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from '../../store/theme'
import { websiteAPI, systemAPI } from '../../services/api'
import { showToast } from '../dashboard/Toast'
import { useGlobalWebSocket } from '../../store/WebSocketContext'
import { getDomain, shouldSkipFavicon } from '../../utils/favicon'

const STATUS_COLORS = {
  ONLINE: '#10b981',
  WARNING: '#f59e0b',
  DEGRADED: '#f97316',
  CRITICAL: '#ef4444',
  OFFLINE: '#ef4444',
  UNKNOWN: '#64748b'
}
const STATUS_GLOW = {
  ONLINE: 'rgba(16,185,129,0.4)', 
  WARNING: 'rgba(245,158,11,0.4)', 
  DEGRADED: 'rgba(249,115,22,0.4)', 
  CRITICAL: 'rgba(234,179,8,0.4)',
  OFFLINE: 'rgba(239,68,68,0.8)', 
  UNKNOWN: 'rgba(100,116,139,0.2)',
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '148,163,184'
}

function rgba(hex, a) { return `rgba(${hexToRgb(hex)},${a})` }

// Color of the outbound probe (the "ping" SPMT server fires at a website).
const PROBE_COLOR = '#00d1b2'

// drawProbe renders one request→reply round-trip along a link.
//   pointAt(tt): position at tt where tt=0 is the website node, tt=1 the server.
//   t:        current head position on that path (0..1).
//   cyclePos: phase 0..1 — first half = server→node (probe), second = node→server (reply).
//   color:    the node's status color, used for the reply leg + arrival ripple.
function drawProbe(ctx, pointAt, t, cyclePos, color, scale = 1) {
  const outbound = cyclePos < 0.5
  const c = outbound ? PROBE_COLOR : color
  const head = pointAt(t)

  // Comet trail — a few fading dots behind the head (opposite travel direction).
  const behind = outbound ? 1 : -1
  for (let k = 3; k >= 1; k--) {
    const tt = Math.min(1, Math.max(0, t + behind * 0.045 * k))
    const p = pointAt(tt)
    ctx.beginPath(); ctx.arc(p.x, p.y, (3.4 - k * 0.6) * scale, 0, Math.PI * 2)
    ctx.fillStyle = rgba(c, 0.28 / k); ctx.fill()
  }

  // Soft halo + bright head.
  ctx.beginPath(); ctx.arc(head.x, head.y, 9 * scale, 0, Math.PI * 2)
  ctx.fillStyle = rgba(c, 0.18); ctx.fill()
  ctx.beginPath(); ctx.arc(head.x, head.y, 4.5 * scale, 0, Math.PI * 2)
  ctx.fillStyle = c; ctx.fill()
  ctx.beginPath(); ctx.arc(head.x, head.y, 2 * scale, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'; ctx.fill()

  // Arrival ripple at the node the instant it starts replying — the "answer".
  if (cyclePos >= 0.5 && cyclePos < 0.62) {
    const prog = (cyclePos - 0.5) / 0.12 // 0 → 1
    const node = pointAt(0)
    ctx.beginPath(); ctx.arc(node.x, node.y, (5 + 16 * prog) * scale, 0, Math.PI * 2)
    ctx.strokeStyle = rgba(color, 0.55 * (1 - prog)); ctx.lineWidth = 2 * scale; ctx.stroke()
  }
}

// ── Layout functions ──────────────────────────────────────────

function calcStarLayout(websites) {
  const displayWebsites = websites.slice(0, 75);
  const n = displayWebsites.length;

  return displayWebsites.map((w, i) => {
    let radius, angle, ring;
    if (i < 15) {
      // Inner circle: 15 nodes
      const innerCount = Math.min(15, n);
      angle = (i / Math.max(innerCount, 1)) * Math.PI * 2 - Math.PI / 2;
      radius = 0.15;
      ring = 0;
    } else if (i < 40) {
      // Middle circle: 25 nodes
      const midCount = Math.min(25, n - 15);
      const midIndex = i - 15;
      const offset = (Math.PI / Math.max(midCount, 1));
      angle = (midIndex / Math.max(midCount, 1)) * Math.PI * 2 - Math.PI / 2 + offset;
      radius = 0.28;
      ring = 1;
    } else {
      // Outer circle: 35 nodes (Total max 75)
      const outerCount = Math.min(35, n - 40);
      const outerIndex = i - 40;
      const offset = (Math.PI / Math.max(outerCount, 1)) * 0.5;
      angle = (outerIndex / Math.max(outerCount, 1)) * Math.PI * 2 - Math.PI / 2 + offset;
      radius = 0.39;
      ring = 2;
    }
    return {
      id: w.id, name: w.name, url: w.url, status: w.status || 'UNKNOWN',
      x: 0.5 + radius * Math.cos(angle),
      y: 0.5 + radius * Math.sin(angle),
      angle, ring
    }
  })
}

function calcTreeLayout(websites) {
  const displayWebsites = websites.slice(0, 75);
  const n = displayWebsites.length;
  if (n === 0) return [];

  // Adjust row density based on count
  const MAX_PER_ROW = n > 60 ? 14 : (n > 40 ? 12 : 10);
  const rows = [];

  const numRows = Math.ceil(n / MAX_PER_ROW);
  const basePerRow = Math.floor(n / numRows);
  let remainder = n % numRows;

  for (let i = 0; i < numRows; i++) {
    let rowSize = basePerRow;
    if (remainder > 0) {
      rowSize += 1;
      remainder -= 1;
    }
    rows.push(rowSize);
  }

  const result = [];
  let idx = 0;

  rows.forEach((rowSize, ri) => {
    const yGap = n > 60 ? 0.12 : 0.15;
    const y = 0.08 + ri * yGap;

    for (let ci = 0; ci < rowSize; ci++) {
      const w = displayWebsites[idx++];
      const xPad = 0.06;
      const xSpan = 1 - xPad * 2;
      const x = rowSize === 1 ? 0.5 : xPad + (ci / (rowSize - 1)) * xSpan;

      result.push({
        id: w.id, name: w.name, url: w.url, status: w.status || 'UNKNOWN',
        x: Math.min(0.94, Math.max(0.06, x)),
        y: Math.min(0.75, Math.max(0.08, y)),
        rowIdx: ri,
      });
    }
  });

  return result;
}

function calc3dLayout(websites) {
  const displayWebsites = websites.slice(0, 75);
  const n = displayWebsites.length;
  const radius = 240; // Virtual 3D sphere radius (slightly larger to avoid overlaps)

  return displayWebsites.map((w, i) => {
    // Fibonacci Sphere algorithm to evenly distribute points on a sphere (globe)
    // golden angle in radians: pi * (3 - sqrt(5))
    const offset = 2 / n;
    const increment = Math.PI * (3 - Math.sqrt(5));

    const y = ((i * offset) - 1) + (offset / 2);
    const r = Math.sqrt(1 - y * y);
    const phi = i * increment;

    const x = Math.cos(phi) * r * radius;
    const z = Math.sin(phi) * r * radius;
    const yVal = y * radius;

    return {
      id: w.id,
      name: w.name,
      url: w.url,
      status: w.status || 'UNKNOWN',
      // Store 3D coordinates relative to origin (0, 0, 0)
      x3d: x,
      y3d: yVal,
      z3d: z,
      ring: i % 3
    };
  });
}

export default function NetworkTopology({ websites, selectedId, onSelect, onOpenDetail, wsConnected }) {
  const { themeId, t, tStatus } = useTheme()
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const timeRef = useRef(0)
  const faviconCache = useRef({})
  const [nodes, setNodes] = useState([])
  const [topoMode, setMode] = useState('star') // 'star' | 'tree'
  const [hoveredId, setHoveredId] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1100)

  const angleXRef = useRef(0)
  const angleYRef = useRef(0)
  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })
  const projectedNodesRef = useRef([])

  const handlePointerDown = useCallback((e) => {
    if (topoMode !== '3d') return
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }, [topoMode])

  const handlePointerUp = useCallback((e) => {
    isDraggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }, [])
  const [showMoreNodes, setShowMoreNodes] = useState(false)
  const [moreNodesSearch, setMoreNodesSearch] = useState('')
  const [moreNodesStatusFilter, setMoreNodesStatusFilter] = useState('ALL')
  const [moreNodesSortBy, setMoreNodesSortBy] = useState('status')

  // All Monitored Nodes Overlay filtering & sorting logic
  const isDark = themeId === 'theme-dark'
  const moreNodesFiltered = websites.filter(w => {
    const matchesSearch = (w.name || '').toLowerCase().includes(moreNodesSearch.toLowerCase()) || 
                          (w.url || '').toLowerCase().includes(moreNodesSearch.toLowerCase())
    
    let matchesStatus = true
    if (moreNodesStatusFilter !== 'ALL') {
      matchesStatus = w.status === moreNodesStatusFilter
    }
    
    return matchesSearch && matchesStatus
  })

  const moreNodesSorted = [...moreNodesFiltered].sort((a, b) => {
    if (moreNodesSortBy === 'status') {
      const order = { OFFLINE: 0, CRITICAL: 1, WARNING: 2, DEGRADED: 3, ONLINE: 4, UNKNOWN: 5 }
      return (order[a.status] ?? 6) - (order[b.status] ?? 6)
    }
    if (moreNodesSortBy === 'a-z') {
      return (a.name || '').localeCompare(b.name || '')
    }
    if (moreNodesSortBy === 'z-a') {
      return (b.name || '').localeCompare(a.name || '')
    }
    if (moreNodesSortBy === 'newest') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
    if (moreNodesSortBy === 'oldest') {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0)
    }
    return 0
  })

  const lastDrawTimeRef = useRef(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sysHealth, setSysHealth] = useState(null)

  useEffect(() => {
    let active = true
    const fetchSysHealth = async () => {
      try {
        const res = await systemAPI.getHealth()
        if (res.data && active) {
          setSysHealth(res.data)
        }
      } catch (err) {
        console.error("Failed to fetch system health in topology:", err)
      }
    }
    fetchSysHealth()
    const timer = setInterval(fetchSysHealth, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  useGlobalWebSocket(useCallback((msg) => {
    if (msg.type === 'system_health') {
      setSysHealth(msg.payload)
    }
  }, []))

  const handleManualRecheck = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await websiteAPI.recheck()
      showToast('Recheck triggered for all websites!', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || t.failedRecheck, 'error')
    } finally {
      setTimeout(() => {
        setIsRefreshing(false)
      }, 1200)
    }
  }, [isRefreshing])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1100)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Preload favicons
  useEffect(() => {
    websites.forEach(w => {
      const domain = getDomain(w.url)
      const shouldSkip = shouldSkipFavicon(w.url)

      if (!shouldSkip && !faviconCache.current[domain]) {
        const img = new Image()
        img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
        img.onload = () => {
          faviconCache.current[domain] = img
          setNodes(prev => [...prev])
        }
        img.onerror = () => { faviconCache.current[domain] = null }
      }
    })
  }, [websites])


  // Recalc layout when websites or mode changes
  useEffect(() => {
    if (topoMode === '3d') {
      setNodes(calc3dLayout(websites))
    } else if (topoMode === 'tree') {
      setNodes(calcTreeLayout(websites))
    } else {
      setNodes(calcStarLayout(websites))
    }
  }, [websites, topoMode])

  const draw = useCallback(() => {
    const now = performance.now()
    const elapsed = now - lastDrawTimeRef.current
    if (elapsed < 50) { // Limit to 20 FPS to reduce CPU/GPU render load
      animFrameRef.current = requestAnimationFrame(draw)
      return
    }
    lastDrawTimeRef.current = now

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    timeRef.current += 0.018
    ctx.clearRect(0, 0, width, height)

    // Background grid
    const isDark = themeId === 'theme-dark'
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }

    const serverX = width * 0.5
    const serverY = topoMode === 'tree' ? height * 0.88 : height * 0.5

    if (topoMode === '3d') {
      // 3D Perspective Projection & Depth Sorting Rendering Loop
      if (!isDraggingRef.current) {
        angleYRef.current += 0.003
      }

      const focalLength = 580
      const cosY = Math.cos(angleYRef.current)
      const sinY = Math.sin(angleYRef.current)
      const cosX = Math.cos(angleXRef.current)
      const sinX = Math.sin(angleXRef.current)
      const cx = width * 0.5
      const cy = height * 0.5

      // Project nodes
      const projected = nodes.map(node => {
        const x = node.x3d || 0
        const y = node.y3d || 0
        const z = node.z3d || 0

        // Rotate around Y-axis
        const x1 = x * cosY - z * sinY
        const z1 = x * sinY + z * cosY

        // Rotate around X-axis
        const y2 = y * cosX - z1 * sinX
        const z2 = y * sinX + z1 * cosX

        // Perspective scale factor
        const scale = focalLength / (focalLength + z2)

        // Project onto 2D screen
        const nx = cx + x1 * scale
        const ny = cy + y2 * scale

        // Dynamic size based on scale - smaller baseR in 3D to avoid overlapping
        const baseR = websites.length > 70 ? 15 : (websites.length > 50 ? 18 : 22)
        const isSel = node.id === selectedId
        const isHov = node.id === hoveredId
        const hoverScale = isHov ? 1.3 : (isSel ? 1.25 : 1.0)
        const r = baseR * scale * hoverScale

        return {
          ...node,
          nx,
          ny,
          rz: z2,
          scale,
          r,
          isHov,
          isSel
        }
      })

      // Store projected nodes in Ref for hit tests
      projectedNodesRef.current = projected

      // Server node representation in depth sorting
      const serverPulse = Math.sin(timeRef.current * 2) * 0.3 + 0.7
      const sScale = 1.0 // center is at rz = 0
      const serverObj = {
        id: 'spmt-server',
        isServer: true,
        nx: cx,
        ny: cy,
        rz: 0,
        scale: sScale,
        r: 42 * sScale,
        isHov: hoveredId === 'spmt-server',
        isSel: false
      }

      // Combine and sort from back to front (descending Z depth)
      const allDrawables = [...projected, serverObj]
      allDrawables.sort((a, b) => b.rz - a.rz)

      // Draw everything in depth-sorted order
      allDrawables.forEach(item => {
        if (item.isServer) {
          // Render central server
          const pRadius = 55 * item.scale
          const sRadius = 42 * item.scale
          ctx.beginPath(); ctx.arc(item.nx, item.ny, pRadius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0, 209, 178, ${serverPulse * 0.08 * item.scale})`; ctx.fill()

          ctx.beginPath(); ctx.arc(item.nx, item.ny, sRadius, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'; ctx.fill()

          ctx.strokeStyle = `rgba(0, 209, 178, ${serverPulse})`; ctx.lineWidth = 3 * item.scale; ctx.stroke()
          ctx.fillStyle = '#1e293b'; ctx.font = `bold ${Math.max(10, 24 * item.scale)}px "Inter", sans-serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('SPMT', item.nx, item.ny - 8 * item.scale)

          ctx.font = `${Math.max(8, 16 * item.scale)}px "Inter", sans-serif`; ctx.fillStyle = 'var(--accent)'
          ctx.fillText('SERVER', item.nx, item.ny + 16 * item.scale)
        } else {
          // Render website node
          const color = STATUS_COLORS[item.status] || STATUS_COLORS.UNKNOWN
          const glow = STATUS_GLOW[item.status] || STATUS_GLOW.UNKNOWN
          const isCrit = item.status === 'OFFLINE'
          const alpha = (item.status === 'ONLINE' ? 0.28 : 0.18) * item.scale

          // 3D connection line to server
          ctx.beginPath()
          ctx.moveTo(item.nx, item.ny)
          ctx.lineTo(cx, cy)
          ctx.strokeStyle = (item.isSel || item.isHov) ? color : `rgba(${hexToRgb(color)},${alpha})`
          ctx.lineWidth = ((item.isSel || item.isHov) ? 4.0 : 2.0) * item.scale
          ctx.setLineDash([])
          ctx.stroke()

          // Animated probe: server pings out (teal) then node replies (status color)
          if (item.status !== 'OFFLINE' && item.status !== 'UNKNOWN') {
            const speed = (item.status === 'CRITICAL' || item.status === 'DEGRADED') ? 1.1 : (item.status === 'WARNING' ? 0.8 : 0.55)
            const cyclePos = (timeRef.current * speed + (item.x3d + item.y3d) * 0.005) % 1
            const t = cyclePos < 0.5 ? (1 - cyclePos * 2) : ((cyclePos - 0.5) * 2)
            const pointAt = (tt) => ({ x: item.nx + (cx - item.nx) * tt, y: item.ny + (cy - item.ny) * tt })
            drawProbe(ctx, pointAt, t, cyclePos, color, item.scale)
          }

          // Node body glow
          if (isCrit) {
            const p = Math.abs(Math.sin(timeRef.current * 3))
            ctx.beginPath(); ctx.arc(item.nx, item.ny, item.r + (item.isHov ? 16 : 12) * p * item.scale, 0, Math.PI * 2)
            const pulseColor = hexToRgb(color)
            ctx.fillStyle = `rgba(${pulseColor},${0.12 * p * item.scale})`; ctx.fill()
          }

          const hPulse = Math.sin(timeRef.current * 1.5 + (item.x3d || 0) * 0.05) * 0.4 + 0.6
          ctx.beginPath(); ctx.arc(item.nx, item.ny, item.r + 8 * item.scale, 0, Math.PI * 2)
          ctx.fillStyle = glow.replace('0.4', String((isCrit ? 0.25 : 0.12) * hPulse * item.scale)); ctx.fill()

          // Hexagon shape
          ctx.beginPath()
          for (let j = 0; j < 6; j++) {
            const a = (Math.PI / 3) * j
            ctx[j === 0 ? 'moveTo' : 'lineTo'](item.nx + item.r * Math.cos(a), item.ny + item.r * Math.sin(a))
          }
          ctx.closePath()
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; ctx.fill()
          ctx.shadowBlur = (item.isHov ? 15 : (item.isSel ? 10 : 0)) * item.scale
          ctx.shadowColor = color
          ctx.strokeStyle = color; ctx.lineWidth = ((item.isSel || item.isHov) ? 3 : isCrit ? 2 : 1.5) * item.scale; ctx.stroke()
          ctx.shadowBlur = 0

          // Favicon / Initial
          const domain = getDomain(item.url)
          const favicon = faviconCache.current[domain]
          const imgSize = item.r * 1.65 | 0
          if (favicon) {
            try {
              ctx.save()
              const half = imgSize / 2;
              ctx.beginPath()
              for (let j = 0; j < 6; j++) { const a = (Math.PI / 3) * j; ctx[j === 0 ? 'moveTo' : 'lineTo'](item.nx + (item.r - 2) * Math.cos(a), item.ny - 1 + (item.r - 2) * Math.sin(a)) }
              ctx.clip()
              ctx.drawImage(favicon, item.nx - half, item.ny - 1 - half, imgSize, imgSize)
              ctx.restore()
            } catch { drawInitial(ctx, item.name, item.nx, item.ny, item.isHov, color, item.scale) }
          } else {
            drawInitial(ctx, item.name, item.nx, item.ny, item.isHov, color, item.scale)
          }

          // Label Box
          const canvasScale = Math.min(width / 1400, height / 900)
          const labelFactor = websites.length > 70 ? 0.75 : (websites.length > 50 ? 0.85 : 1)
          const baseFontSize = Math.max(8, 16 * canvasScale * labelFactor * item.scale)
          const hoverFontSize = Math.max(10, 20 * canvasScale * item.scale)

          const name = item.name.length > 20 ? item.name.slice(0, 18) + '…' : item.name
          ctx.font = `${(item.isSel || item.isHov) ? '1000' : '900'} ${item.isHov ? hoverFontSize : baseFontSize}px "Inter", sans-serif`

          const tw = ctx.measureText(name).width + (item.isHov ? 16 : 12) * item.scale
          const th = (item.isHov ? 30 : 22) * item.scale

          const radAngle = Math.atan2(item.ny - cy, item.nx - cx)
          const labelDist = item.r + (12 + (item.isHov ? 4 : 0)) * item.scale
          const lx = item.nx + Math.cos(radAngle) * labelDist
          const ly = item.ny + Math.sin(radAngle) * labelDist

          let txAlign = 'center', txBaseline = 'middle'
          if (Math.abs(Math.cos(radAngle)) > 0.7) {
            txAlign = Math.cos(radAngle) > 0 ? 'left' : 'right'
          } else {
            txBaseline = Math.sin(radAngle) > 0 ? 'top' : 'bottom'
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.strokeStyle = item.isHov ? color : (isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.1)')
          ctx.lineWidth = item.isHov ? 2 : 1

          let boxX = lx, boxY = ly
          if (txAlign === 'left') boxX = lx
          else if (txAlign === 'right') boxX = lx - tw
          else boxX = lx - tw / 2

          if (txBaseline === 'top') boxY = ly
          else if (txBaseline === 'bottom') boxY = ly - th
          else boxY = ly - th / 2

          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(boxX, boxY, tw, th, 6 * item.scale)
          else ctx.rect(boxX, boxY, tw, th)
          ctx.fill(); ctx.stroke()

          ctx.textAlign = txAlign; ctx.textBaseline = txBaseline
          ctx.fillStyle = item.isHov ? color : '#0f172a'
          ctx.fillText(name, lx + (txAlign === 'left' ? 8 * item.scale : (txAlign === 'right' ? -8 * item.scale : 0)), ly + (txBaseline === 'top' ? 4 * item.scale : (txBaseline === 'bottom' ? -4 * item.scale : 0)))

          // Status dot
          const badgeX = item.nx + item.r - 4 * item.scale
          const badgeY = item.ny - item.r + 4 * item.scale
          const badgeSize = (item.isHov ? 14 : 10) * item.scale

          if (item.status === 'WARNING') {
            ctx.beginPath()
            ctx.moveTo(badgeX, badgeY - badgeSize)
            ctx.lineTo(badgeX + badgeSize, badgeY + badgeSize/2)
            ctx.lineTo(badgeX - badgeSize, badgeY + badgeSize/2)
            ctx.closePath()
            ctx.fillStyle = '#facc15'
            ctx.fill()
            ctx.strokeStyle = '#ca8a04'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = '#ca8a04'
            ctx.font = `bold ${badgeSize}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('!', badgeX, badgeY - 1)
          } else if (item.status === 'DEGRADED') {
            ctx.beginPath()
            ctx.arc(badgeX, badgeY, badgeSize*0.8, 0, Math.PI * 2)
            ctx.fillStyle = '#fdba74'
            ctx.fill()
            ctx.strokeStyle = '#f97316'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = '#c2410c'
            ctx.font = `bold ${badgeSize}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('!', badgeX, badgeY + 1)
          } else if (item.status === 'CRITICAL') {
            ctx.beginPath()
            ctx.moveTo(badgeX, badgeY - badgeSize*1.2)
            ctx.lineTo(badgeX + badgeSize*1.2, badgeY + badgeSize*0.6)
            ctx.lineTo(badgeX - badgeSize*1.2, badgeY + badgeSize*0.6)
            ctx.closePath()
            ctx.fillStyle = '#ea580c'
            ctx.fill()
            ctx.strokeStyle = '#c2410c'
            ctx.lineWidth = 1
            ctx.stroke()
            
            ctx.beginPath()
            ctx.moveTo(badgeX, badgeY - badgeSize*0.6)
            ctx.lineTo(badgeX + badgeSize*0.6, badgeY + badgeSize*0.3)
            ctx.lineTo(badgeX - badgeSize*0.6, badgeY + badgeSize*0.3)
            ctx.closePath()
            ctx.fillStyle = '#ffffff'
            ctx.fill()

            ctx.fillStyle = '#c2410c'
            ctx.font = `bold ${badgeSize*0.7}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('!', badgeX, badgeY)
          } else {
            ctx.beginPath(); ctx.arc(badgeX, badgeY, (item.isHov ? 6 : 4) * item.scale, 0, Math.PI * 2)
            ctx.fillStyle = color; ctx.fill()
          }
        }
      })
    } else {
      // ORIGINAL 2D Layout rendering logic
      // Server node
      const pulse = Math.sin(timeRef.current * 2) * 0.3 + 0.7
      
      // Draw connections + data packets
      nodes.forEach(node => {
        const nx = node.x * width, ny = node.y * height
        const color = STATUS_COLORS[node.status] || STATUS_COLORS.UNKNOWN
        const isSel = node.id === selectedId
        const isHov = node.id === hoveredId

        const alpha = node.status === 'ONLINE' ? 0.28 : 0.18
        ctx.beginPath()
        ctx.moveTo(nx, ny)
        if (topoMode === 'tree') {
          const cpY1 = ny + (serverY - ny) * 0.4
          const cpY2 = serverY - (serverY - ny) * 0.4
          ctx.bezierCurveTo(nx, cpY1, serverX, cpY2, serverX, serverY)
        } else {
          ctx.lineTo(serverX, serverY)
        }
        ctx.strokeStyle = (isSel || isHov) ? color : `rgba(${hexToRgb(color)},${alpha})`
        ctx.lineWidth = (isSel || isHov) ? 4.0 : 2.0
        ctx.setLineDash([])
        ctx.stroke()

        // Animated probe: SPMT server pings out to the node (teal), then the
        // node replies back to the server (status color) — a request→reply trip.
        if (node.status !== 'OFFLINE' && node.status !== 'UNKNOWN') {
          const speed = (node.status === 'CRITICAL' || node.status === 'DEGRADED') ? 1.1 : (node.status === 'WARNING' ? 0.8 : 0.55)
          const cyclePos = (timeRef.current * speed + node.x * 3 + node.y * 2) % 1
          const t = cyclePos < 0.5 ? (1 - cyclePos * 2) : ((cyclePos - 0.5) * 2)
          let pointAt
          if (topoMode === 'tree') {
            const cpY1 = ny + (serverY - ny) * 0.4
            const cpY2 = serverY - (serverY - ny) * 0.4
            pointAt = (tt) => {
              const mt = 1 - tt
              return {
                x: mt * mt * mt * nx + 3 * mt * mt * tt * nx + 3 * mt * tt * tt * serverX + tt * tt * tt * serverX,
                y: mt * mt * mt * ny + 3 * mt * mt * tt * cpY1 + 3 * mt * tt * tt * cpY2 + tt * tt * tt * serverY,
              }
            }
          } else {
            pointAt = (tt) => ({ x: nx + (serverX - nx) * tt, y: ny + (serverY - ny) * tt })
          }
          drawProbe(ctx, pointAt, t, cyclePos, color)
        }
      })

      // Draw server node
      ctx.beginPath(); ctx.arc(serverX, serverY, 55, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0, 209, 178, ${pulse * 0.08})`; ctx.fill()
      ctx.beginPath(); ctx.arc(serverX, serverY, 42, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'; ctx.fill()
      ctx.strokeStyle = `rgba(0, 209, 178, ${pulse})`; ctx.lineWidth = 3; ctx.stroke()
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 24px "Inter", sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('SPMT', serverX, serverY - 8)
      ctx.font = '16px "Inter", sans-serif'; ctx.fillStyle = 'var(--accent)'
      ctx.fillText('SERVER', serverX, serverY + 16)

      // Website nodes
      nodes.forEach(node => {
        const nx = node.x * width, ny = node.y * height
        const color = STATUS_COLORS[node.status] || STATUS_COLORS.UNKNOWN
        const glow = STATUS_GLOW[node.status] || STATUS_GLOW.UNKNOWN
        const isSel = node.id === selectedId
        const isHov = node.id === hoveredId
        const isCrit = node.status === 'OFFLINE'

        // Node size
        const baseR = websites.length > 70 ? 25 : (websites.length > 50 ? 30 : 35)
        const r = isHov ? baseR * 1.3 : (isSel ? baseR * 1.25 : baseR)

        // Critical pulse ring
        if (isCrit) {
          const p = Math.abs(Math.sin(timeRef.current * 3))
          ctx.beginPath(); ctx.arc(nx, ny, r + (isHov ? 16 : 12) * p, 0, Math.PI * 2)
          const pulseColor = hexToRgb(color)
          ctx.fillStyle = `rgba(${pulseColor},${0.12 * p})`; ctx.fill()
        }

        // Glow halo
        const hPulse = Math.sin(timeRef.current * 1.5 + node.x * 10) * 0.4 + 0.6
        ctx.beginPath(); ctx.arc(nx, ny, r + 8, 0, Math.PI * 2)
        ctx.fillStyle = glow.replace('0.4', String((isCrit ? 0.25 : 0.12) * hPulse)); ctx.fill()

        // Node body
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i
          ctx[i === 0 ? 'moveTo' : 'lineTo'](nx + r * Math.cos(a), ny + r * Math.sin(a))
        }
        ctx.closePath()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; ctx.fill()
        ctx.shadowBlur = isHov ? 15 : (isSel ? 10 : 0)
        ctx.shadowColor = color
        ctx.strokeStyle = color; ctx.lineWidth = (isSel || isHov) ? 3 : isCrit ? 2 : 1.5; ctx.stroke()
        ctx.shadowBlur = 0

        // Favicon
        const domain = getDomain(node.url)
        const favicon = faviconCache.current[domain]
        const imgSize = r * 1.65 | 0
        if (favicon) {
          try {
            ctx.save()
            const half = imgSize / 2;
            ctx.beginPath()
            for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; ctx[i === 0 ? 'moveTo' : 'lineTo'](nx + (r - 2) * Math.cos(a), ny - 1 + (r - 2) * Math.sin(a)) }
            ctx.clip()
            ctx.drawImage(favicon, nx - half, ny - 1 - half, imgSize, imgSize)
            ctx.restore()
          } catch { drawInitial(ctx, node.name, nx, ny, isHov, color) }
        } else {
          drawInitial(ctx, node.name, nx, ny, isHov, color)
        }

        // Label
        const canvasScale = Math.min(width / 1400, height / 900)
        const labelFactor = websites.length > 70 ? 0.75 : (websites.length > 50 ? 0.85 : 1)
        const baseFontSize = Math.max(12, 16 * canvasScale * labelFactor)
        const hoverFontSize = Math.max(14, 20 * canvasScale)

        const name = node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name
        ctx.font = `${(isSel || isHov) ? '1000' : '900'} ${isHov ? hoverFontSize : baseFontSize}px "Inter", sans-serif`
        const tw = ctx.measureText(name).width + (isHov ? 16 : 12)
        const th = isHov ? 30 : 22

        let lx = nx, ly = ny, txAlign = 'center', txBaseline = 'middle'
        const ang = Math.atan2(node.y - 0.5, node.x - 0.5) * 180 / Math.PI
        const offset = r + (isHov ? 16 : 12)

        if (topoMode === 'tree') {
          ly = ny + offset; txBaseline = 'top'
        } else {
          const radAngle = Math.atan2(node.y - 0.5, node.x - 0.5)
          const labelDist = offset + (node.ring === 0 ? 5 : (node.ring === 1 ? 8 : 10))
          lx = nx + Math.cos(radAngle) * labelDist
          ly = ny + Math.sin(radAngle) * labelDist

          if (Math.abs(Math.cos(radAngle)) > 0.7) {
            txAlign = Math.cos(radAngle) > 0 ? 'left' : 'right'
            txBaseline = 'middle'
          } else {
            txAlign = 'center'
            txBaseline = Math.sin(radAngle) > 0 ? 'top' : 'bottom'
          }
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.strokeStyle = isHov ? color : (isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.1)')
        ctx.lineWidth = isHov ? 2 : 1

        let boxX = lx, boxY = ly
        if (txAlign === 'left') boxX = lx
        else if (txAlign === 'right') boxX = lx - tw
        else boxX = lx - tw / 2

        if (txBaseline === 'top') boxY = ly
        else if (txBaseline === 'bottom') boxY = ly - th
        else boxY = ly - th / 2

        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, tw, th, 6)
        else ctx.rect(boxX, boxY, tw, th)
        ctx.fill(); ctx.stroke()

        ctx.textAlign = txAlign; ctx.textBaseline = txBaseline
        ctx.fillStyle = isHov ? color : '#0f172a'
        ctx.fillText(name, lx + (txAlign === 'left' ? 8 : (txAlign === 'right' ? -8 : 0)), ly + (txBaseline === 'top' ? 4 : (txBaseline === 'bottom' ? -4 : 0)))

        // Status badge
        const badgeX = nx + r - 4
        const badgeY = ny - r + 4
        const badgeSize = isHov ? 14 : 10

        if (node.status === 'WARNING') {
          ctx.beginPath()
          ctx.moveTo(badgeX, badgeY - badgeSize)
          ctx.lineTo(badgeX + badgeSize, badgeY + badgeSize/2)
          ctx.lineTo(badgeX - badgeSize, badgeY + badgeSize/2)
          ctx.closePath()
          ctx.fillStyle = '#facc15'
          ctx.fill()
          ctx.strokeStyle = '#ca8a04'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.fillStyle = '#ca8a04'
          ctx.font = `bold ${badgeSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('!', badgeX, badgeY - 1)
        } else if (node.status === 'DEGRADED') {
          ctx.beginPath()
          ctx.arc(badgeX, badgeY, badgeSize*0.8, 0, Math.PI * 2)
          ctx.fillStyle = '#fdba74'
          ctx.fill()
          ctx.strokeStyle = '#f97316'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.fillStyle = '#c2410c'
          ctx.font = `bold ${badgeSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('!', badgeX, badgeY + 1)
        } else if (node.status === 'CRITICAL') {
          ctx.beginPath()
          ctx.moveTo(badgeX, badgeY - badgeSize*1.2)
          ctx.lineTo(badgeX + badgeSize*1.2, badgeY + badgeSize*0.6)
          ctx.lineTo(badgeX - badgeSize*1.2, badgeY + badgeSize*0.6)
          ctx.closePath()
          ctx.fillStyle = '#ea580c'
          ctx.fill()
          ctx.strokeStyle = '#c2410c'
          ctx.lineWidth = 1
          ctx.stroke()
          
          ctx.beginPath()
          ctx.moveTo(badgeX, badgeY - badgeSize*0.6)
          ctx.lineTo(badgeX + badgeSize*0.6, badgeY + badgeSize*0.3)
          ctx.lineTo(badgeX - badgeSize*0.6, badgeY + badgeSize*0.3)
          ctx.closePath()
          ctx.fillStyle = '#ffffff'
          ctx.fill()

          ctx.fillStyle = '#c2410c'
          ctx.font = `bold ${badgeSize*0.7}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('!', badgeX, badgeY)
        } else {
          ctx.beginPath(); ctx.arc(badgeX, badgeY, isHov ? 6 : 4, 0, Math.PI * 2)
          ctx.fillStyle = color; ctx.fill()
        }
      })
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [nodes, selectedId, hoveredId, topoMode, themeId])

  function drawInitial(ctx, name, nx, ny, isHov, color, scale = 1.0) {
    ctx.fillStyle = color || 'var(--text-sub)'
    ctx.font = `900 ${isHov ? 28 * scale : 22 * scale}px "Inter", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((name || 'W')[0].toUpperCase(), nx, ny - 2 * scale)
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
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    return () => ro.disconnect()
  }, [])

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { width, height } = canvas

    // Check central server node
    const serverX = width * 0.5
    const serverY = topoMode === 'tree' ? height * 0.88 : height * 0.5
    if (Math.sqrt((mx - serverX) ** 2 + (my - serverY) ** 2) < 55) {
      onOpenDetail?.({ id: 'spmt-server', name: 'SPMT SERVER', url: 'Local Monitor System', status: 'ONLINE', isServer: true })
      return
    }

    if (topoMode === '3d') {
      for (const pNode of projectedNodesRef.current) {
        if (pNode.id === 'spmt-server') continue
        if (Math.sqrt((mx - pNode.nx) ** 2 + (my - pNode.ny) ** 2) < pNode.r) {
          onSelect?.(pNode.id === selectedId ? null : pNode.id)
          onOpenDetail?.({ id: pNode.id, name: pNode.name, url: pNode.url, status: pNode.status })
          return
        }
      }
    } else {
      for (const node of nodes) {
        const nx = node.x * width, ny = node.y * height
        if (Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2) < 48) {
          onSelect?.(node.id === selectedId ? null : node.id)
          onOpenDetail?.({ id: node.id, name: node.name, url: node.url, status: node.status })
          return
        }
      }
    }
    onSelect?.(null)
  }, [nodes, selectedId, onSelect, onOpenDetail, topoMode])

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { width, height } = canvas

    // 3D dragging
    if (topoMode === '3d' && isDraggingRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x
      const dy = e.clientY - lastMousePosRef.current.y
      angleYRef.current += dx * 0.005
      angleXRef.current += dy * 0.005
      angleXRef.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, angleXRef.current))
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Check central server node
    const serverX = width * 0.5
    const serverY = topoMode === 'tree' ? height * 0.88 : height * 0.5
    if (Math.sqrt((mx - serverX) ** 2 + (my - serverY) ** 2) < 55) {
      setHoveredId('spmt-server')
      canvas.style.cursor = 'pointer'
      return
    }

    let currentHoveredId = null
    if (topoMode === '3d') {
      for (const pNode of projectedNodesRef.current) {
        if (pNode.id === 'spmt-server') continue
        if (Math.sqrt((mx - pNode.nx) ** 2 + (my - pNode.ny) ** 2) < pNode.r) {
          currentHoveredId = pNode.id
          break
        }
      }
    } else {
      for (const node of nodes) {
        const nx = node.x * width, ny = node.y * height
        if (Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2) < 36) {
          currentHoveredId = node.id
          break
        }
      }
    }

    setHoveredId(currentHoveredId)
    canvas.style.cursor = currentHoveredId ? 'pointer' : 'default'
  }, [nodes, topoMode])

  const hoveredNodeData = hoveredId === 'spmt-server'
    ? {
      name: 'SPMT SERVER',
      status: (sysHealth?.backend_cpu > 80 || sysHealth?.backend_ram > 85) ? 'CRITICAL' : 'ONLINE',
      url: 'Local System Monitor',
      ip_address: sysHealth?.public_ip || '127.0.0.1',
      isServer: true
    }
    : (hoveredId ? websites.find(w => w.id === hoveredId) : null)

  const hoveredNodeObj = (hoveredId && hoveredId !== 'spmt-server') ? nodes.find(n => n.id === hoveredId) : null

  let cardPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: isMobile ? 'none' : 1, height: isMobile ? '380px' : 'auto', position: 'relative', marginBottom: isMobile ? 12 : 0 }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-anim {
          animation: spin 1s linear infinite;
        }
      `}</style>
      {/* ── CENTRAL HOLOGRAM PANEL ── */}
      {hoveredNodeData && (hoveredNodeObj || hoveredId === 'spmt-server') && (
        <div style={{
          position: 'absolute', top: cardPos.top, left: cardPos.left, transform: cardPos.transform,
          width: hoveredNodeData.isServer ? 420 : 400,
          background: 'rgba(15, 23, 42, 0.94)', backdropFilter: 'blur(20px)',
          border: `2px solid ${STATUS_COLORS[hoveredNodeData.status] || 'var(--accent)'}`,
          borderRadius: 24, padding: '28px',
          boxShadow: `0 0 80px rgba(0,0,0,0.8), 0 0 30px ${(STATUS_COLORS[hoveredNodeData.status] || '#6366f1')}33`,
          zIndex: 100, pointerEvents: 'none',
          animation: 'hologramIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex', flexDirection: 'column', gap: 14
        }}>
          <style>{`
            @keyframes hologramIn {
              from { opacity: 0; filter: blur(30px) brightness(2); transform: translate(-50%, -55%) scale(1.1); }
              to { opacity: 1; filter: blur(0px) brightness(1); transform: translate(-50%, -50%) scale(1); }
            }
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_COLORS[hoveredNodeData.status], boxShadow: `0 0 10px ${STATUS_COLORS[hoveredNodeData.status]}` }} />
              <span style={{ fontSize: 20, fontWeight: 1000, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{hoveredNodeData.name}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 900, color: STATUS_COLORS[hoveredNodeData.status], background: 'rgba(0,0,0,0.3)', padding: '5px 13px', borderRadius: 6 }}>{tStatus(hoveredNodeData.status)}</span>
          </div>

          {hoveredNodeData.isServer ? (
            /* ── SERVER NODE LAYOUT ── */
            <>
              {/* CPU & RAM bars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: t.cpuUsage, value: sysHealth?.backend_cpu ?? 0, warn: 80, color: '#6366f1' },
                  { label: t.ramUsage, value: sysHealth?.backend_ram ?? 0, warn: 85, color: '#8b5cf6' },
                ].map(({ label, value, warn, color }) => {
                  const pct = Math.min(100, Math.round(value))
                  const isHigh = pct >= warn
                  const barColor = isHigh ? '#ef4444' : color
                  return (
                    <div key={label} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 800, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 1000, color: isHigh ? '#ef4444' : '#fff', marginBottom: 8 }}>{pct}<span style={{ fontSize: 13 }}>%</span></div>
                      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: barColor, transition: 'width 0.5s ease', boxShadow: isHigh ? `0 0 8px ${barColor}` : 'none' }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Network info */}
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 800, marginBottom: 2 }}>{t.networkConnection}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.netType}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#00d1b2' }}>{sysHealth?.network_type || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{t.netName}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{sysHealth?.network_name || '—'}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>IP  </span>{sysHealth?.public_ip || '127.0.0.1'}
                  </div>
                  {sysHealth?.interface_alias && (
                    <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>IF  </span>{sysHealth.interface_alias}
                    </div>
                  )}
                </div>
              </div>

              {/* High load warning */}
              {((sysHealth?.backend_cpu ?? 0) >= 80 || (sysHealth?.backend_ram ?? 0) >= 85) && (
                <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 800, background: 'rgba(251,191,36,0.08)', padding: '9px 13px', borderRadius: 8, border: '1px solid rgba(251,191,36,0.2)', lineHeight: 1.5 }}>
                  {t.highLoadClick}
                </div>
              )}
            </>
          ) : (
            /* ── WEBSITE NODE LAYOUT ── */
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{t.endpointIpAddress}</div>
                <div style={{ fontSize: 13, color: '#cbd5e1', wordBreak: 'break-all', fontFamily: 'monospace' }}>{hoveredNodeData.url}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>IP: {hoveredNodeData.ip_address || '---'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 12 }}>
                <div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{t.thLatency}</div>
                  <div style={{ fontSize: 24, fontWeight: 1000, color: '#fff' }}>{hoveredNodeData.response_time_ms ? `${hoveredNodeData.response_time_ms}ms` : '---'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{t.httpCodeLabel}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{hoveredNodeData.status_code || '---'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{t.sslStatusLabel}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: hoveredNodeData.ssl_valid ? '#10b981' : (hoveredNodeData.ssl_valid === false ? '#ef4444' : '#64748b') }}>
                    {hoveredNodeData.ssl_valid === true ? `✓ ${t.validLabel}` : (hoveredNodeData.ssl_valid === false ? `✗ ${t.invalidLabel}` : 'PND')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{t.lastCheckLabel}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                    {hoveredNodeData.last_checked ? new Date(hoveredNodeData.last_checked).toLocaleTimeString([], { hour12: false }) : '---'}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" style={{ marginRight: 8, filter: 'drop-shadow(0 0 4px var(--accent))' }}>
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="8" /><line x1="12" y1="16" x2="12" y2="22" />
          </svg>
          {t.networkTopologyTitle}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Topology mode toggle */}
          <div style={{ display: 'flex', background: 'var(--accent-light)', border: `1px solid var(--border)`, borderRadius: 6, overflow: 'hidden' }}>
            {['star', 'tree', '3d'].map(m => (
              <button
                key={m}
                style={{
                  background: topoMode === m ? 'rgba(59,130,246,0.3)' : 'transparent',
                  border: 'none',
                  color: topoMode === m ? '#3b82f6' : '#4a5568',
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.07em',
                  padding: '6px 16px', cursor: 'pointer', transition: 'all 0.15s',
                  borderRight: m !== '3d' ? `1px solid var(--border)` : 'none',
                }}
                onClick={() => setMode(m)}
              >
                {m === 'star' ? '✦ STAR' : m === 'tree' ? '⑂ TREE' : '🌀 3D'}
              </button>
            ))}
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRecheck}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: isRefreshing ? 'var(--accent-light)' : 'rgba(99,102,241,0.1)',
              border: `1px solid ${isRefreshing ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              color: 'var(--accent)',
              fontSize: '11px',
              fontWeight: 900,
              letterSpacing: '0.07em',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              boxShadow: isRefreshing ? '0 0 10px var(--accent-light)' : 'none',
              transform: isRefreshing ? 'scale(0.95)' : 'scale(1)',
            }}
            onMouseEnter={e => {
              if (!isRefreshing) {
                e.currentTarget.style.background = 'var(--accent-light)'
                e.currentTarget.style.transform = 'scale(1.05)'
                e.currentTarget.style.boxShadow = '0 0 8px var(--accent-light)'
              }
            }}
            onMouseLeave={e => {
              if (!isRefreshing) {
                e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
          >
            <svg
              className={isRefreshing ? 'spin-anim' : ''}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'transform 0.5s ease',
              }}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isRefreshing ? t.refreshing : t.refresh}</span>
          </button>

          {/* Node count */}
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-sub)', background: 'var(--accent-light)', padding: '2px 10px', borderRadius: 10, border: '1px solid var(--border)' }}>
            {websites.length} {t.nodesLabel}
          </span>

          {/* LIVE badge */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 900, letterSpacing: '0.05em',
            color: wsConnected ? '#10b981' : '#f59e0b',
            background: wsConnected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            border: '1px solid ' + (wsConnected ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'),
            borderRadius: 10, padding: '3px 12px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: wsConnected ? '#10b981' : '#f59e0b' }} />
            {wsConnected ? t.liveCaps : t.connecting}
          </span>
        </div>
      </div>

      {/* Canvas Layer & Radar */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* Radar Animations */}
          <div style={{ position: 'absolute', top: topoMode === 'tree' ? '88%' : '50%', left: '50%', width: '200%', height: '200%', background: 'conic-gradient(from 0deg, transparent 70%, rgba(99,102,241,0.15) 100%)', borderRadius: '50%', pointerEvents: 'none', animation: 'radarSweep 4s linear infinite', zIndex: 0 }} />
          <div style={{ position: 'absolute', top: topoMode === 'tree' ? '88%' : '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200%', height: '200%', background: 'radial-gradient(circle, transparent 10%, rgba(99,102,241,0.05) 11%, transparent 12%, transparent 20%, rgba(99,102,241,0.05) 21%, transparent 22%, transparent 30%, rgba(99,102,241,0.05) 31%, transparent 32%)', pointerEvents: 'none', zIndex: 0 }} />

          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 1, touchAction: 'none' }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onMouseLeave={() => {
              setHoveredId(null)
              isDraggingRef.current = false
            }}
          />

          {/* + MORE button logic */}
          {websites.length > 75 && (
            <button
              onClick={() => setShowMoreNodes(true)}
              style={{
                position: 'absolute', bottom: 16, right: 16, zIndex: 10,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.05em',
                boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'transform 0.1s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              + {websites.length - 75} {t.moreLabel}
            </button>
          )}
        </div>
      </div>

      {/* Show More Overlay */}
      {showMoreNodes && (
        <div style={{
          position: 'absolute', inset: 0, background: isDark ? 'rgba(10, 14, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(20px)',
          zIndex: 200, display: 'flex', flexDirection: 'column', padding: 24,
          animation: 'fadeIn 0.2s ease-out', border: '1px solid var(--border)'
        }}>
          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ color: 'var(--text)', margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '0.02em' }}>{t.allMonitoredNodes}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.showingAll} {moreNodesSorted.length}/{websites.length} {t.endpointsLabel}</div>
              </div>
 
              {/* Overlay Search Bar */}
              <div style={{ position: 'relative', width: 260 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.4 }}>🔍</span>
                <input
                  style={{
                    width: '100%', padding: '10px 36px 10px 38px', borderRadius: 20,
                    border: '1px solid var(--border)', background: 'var(--bg-main)',
                    color: 'var(--text)', fontSize: 13, outline: 'none', transition: 'all 0.2s'
                  }}
                  placeholder={t.searchNodeUrl}
                  value={moreNodesSearch}
                  onChange={(e) => setMoreNodesSearch(e.target.value)}
                />
                {moreNodesSearch && (
                  <button onClick={() => setMoreNodesSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                )}
              </div>

              {/* Status filter select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>🚦</span>
                <select
                  style={{
                    padding: '8px 12px', borderRadius: 20,
                    border: '1px solid var(--border)', background: 'var(--bg-main)',
                    color: 'var(--text)', fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer'
                  }}
                  value={moreNodesStatusFilter}
                  onChange={e => setMoreNodesStatusFilter(e.target.value)}
                >
                  <option value="ALL">{t.allStatus}</option>
                  <option value="ONLINE">🟢 {t.online}</option>
                  <option value="CRITICAL">🟡 {t.critical}</option>
                  <option value="OFFLINE">🔴 {t.offline}</option>
                </select>
              </div>

              {/* Sort by select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>↕️</span>
                <select
                  style={{
                    padding: '8px 12px', borderRadius: 20,
                    border: '1px solid var(--border)', background: 'var(--bg-main)',
                    color: 'var(--text)', fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer'
                  }}
                  value={moreNodesSortBy}
                  onChange={e => setMoreNodesSortBy(e.target.value)}
                >
                  <option value="status">{t.sortLabel}</option>
                  <option value="a-z">{t.sortNameAz}</option>
                  <option value="z-a">{t.sortNameZa}</option>
                  <option value="newest">{t.newestLabel}</option>
                  <option value="oldest">{t.oldestLabel}</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => setShowMoreNodes(false)}
              style={{ background: 'var(--accent-light)', border: 'none', color: 'var(--text)', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.background = 'var(--border-strong)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
            >✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text)', fontSize: 13 }}>
              <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--border)' }}>
                <tr>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)' }}>{t.thStatus}</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)' }}>{t.thEndpointName}</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)' }}>{t.thUrl}</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)' }}>{t.thLatency}</th>
                </tr>
              </thead>
              <tbody>
                {moreNodesSorted.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                      {t.noNodesMatch}
                      <button
                        onClick={() => { setMoreNodesSearch(''); setMoreNodesStatusFilter('ALL'); setMoreNodesSortBy('status') }}
                        style={{ display: 'inline-block', marginLeft: 8, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700, textDecoration: 'underline' }}
                      >
                        {t.resetFilters}
                      </button>
                    </td>
                  </tr>
                ) : (
                  moreNodesSorted.map(w => (
                    <tr
                      key={w.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', cursor: 'pointer' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => {
                        onOpenDetail?.(w)
                      }}
                    >
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{
                          color: STATUS_COLORS[w.status] || STATUS_COLORS.UNKNOWN,
                          background: `${STATUS_COLORS[w.status] || STATUS_COLORS.UNKNOWN}15`,
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800
                        }}>
                          {tStatus(w.status || 'UNKNOWN')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 20px', fontWeight: 800 }}>{w.name}</td>
                      <td style={{ padding: '12px 20px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{w.url}</td>
                      <td style={{ padding: '12px 20px', fontWeight: 700, color: w.response_time_ms > 1000 ? '#d97706' : '#059669' }}>{w.response_time_ms ? `${w.response_time_ms}ms` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nodes.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.noWebsitesMonitored}</div>
          <div style={{ color: 'var(--text-sub)', fontSize: 11, marginTop: 4 }}>{t.addWebsitesToBegin}</div>
        </div>
      )}
    </div>
  )
}
