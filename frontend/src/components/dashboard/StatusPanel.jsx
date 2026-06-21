import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../store/theme'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import MonitoringGraph from './MonitoringGraph'
import { Info, X, Zap } from 'lucide-react'
import { getDomain, shouldSkipFavicon } from '../../utils/favicon'

function InfoModal({ onClose }) {
  const { t, tStatus } = useTheme()
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: 560, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)', animation: 'fadeIn 0.2s ease' }}>
        <div style={{ padding: '20px 24px', background: 'var(--primary)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Info size={18} /></div>
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.02em' }}>{t.monitoringGuide}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', opacity: 0.8 }}><X /></button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 25 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 15, textTransform: 'uppercase' }}>{t.statusLegendConditions}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { s: 'ONLINE', c: '#10b981', t: t.legendOnlineCond, d: t.legendOnlineDesc },
                { s: 'WARNING', c: '#f59e0b', t: t.legendWarningCond, d: t.legendWarningDesc },
                { s: 'CRITICAL', c: '#ef4444', t: t.legendCriticalCond, d: t.legendCriticalDesc },
                { s: 'OFFLINE', c: '#dc2626', t: t.legendOfflineCond, d: t.legendOfflineDesc }
              ].map(item => (
                <div key={item.s} style={{ display: 'flex', gap: 16, padding: 14, background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.c, marginTop: 4, flexShrink: 0, boxShadow: `0 0 10px ${item.c}44` }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: item.c }}>{tStatus(item.s)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}>{item.t}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5 }}>{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 20, background: 'rgba(99, 102, 241, 0.05)', borderRadius: 12, border: '1px dashed var(--accent)' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} /> {t.engineMonitoring}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t.engineDesc}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Helpers ──────────────────────────────────────────────────
const fmtMs = ms => ms != null ? `${ms}ms` : '—'

const BADGE = {
  ONLINE: { color: '#10b981', glow: 'rgba(16,185,129,0.15)' },
  WARNING: { color: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
  CRITICAL: { color: '#ef4444', glow: 'rgba(239,68,68,0.15)' },
  OFFLINE: { color: '#dc2626', glow: 'rgba(220,38,38,0.15)' },
  UNKNOWN: { color: '#94a3b8', glow: 'none' },
}

// ── Sub-components ────────────────────────────────────────────

function Favicon({ url, name }) {
  const domain = getDomain(url)
  const shouldSkip = shouldSkipFavicon(url)

  const initial = (name || 'W')[0].toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {!shouldSkip ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          width={22} height={22} alt=""
          style={{ display: 'block' }}
          onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex' }}
        />
      ) : null}
      <span style={{ display: shouldSkip ? 'flex' : 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
        {initial}
      </span>
    </div>
  )
}

// ── ServiceRow (Compact List Item) ────────────────────────────

function ServiceRow({ w, isSelected, onSelect, onOpenDetail, isDark }) {
  const { t, tStatus } = useTheme()
  const c = BADGE[w.status] || BADGE.UNKNOWN
  const isOnline = w.status === 'ONLINE'
  const [hover, setHover] = useState(false)

  // Dynamic colors for dark vs light theme - user requested bright vibrant cards in dark mode
  const normalBg = isDark ? 'rgba(255, 255, 255, 0.9)' : 'var(--bg-card)'
  const hoverBg = isDark ? '#ffffff' : '#f1f5f9'
  const selectedBg = isDark ? '#ffffff' : 'rgba(59, 130, 246, 0.1)'
  const normalBorder = isDark ? 'rgba(255, 255, 255, 0.5)' : 'var(--border)'
  const selectedBorder = c.color
  
  const textColor = isDark ? '#0f172a' : 'var(--text)'
  const subTextColor = isDark ? '#334155' : 'var(--text-sub)'

  return (
    <div
      className={`glass-card hover-glow ${w.status === 'OFFLINE' || w.status === 'CRITICAL' ? 'glitch-offline' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        cursor: 'pointer', 
        transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
        border: '1px solid',
        borderColor: isSelected ? selectedBorder : (hover ? (isDark ? c.color : '#94a3b8') : normalBorder),
        background: isSelected ? selectedBg : (hover ? hoverBg : normalBg),
        marginBottom: 10, borderRadius: 0,
        boxShadow: isSelected 
          ? `0 0 12px ${c.color}50, 0 0 8px ${c.color}30 inset` 
          : (hover ? `0 4px 15px ${c.color}40` : '0 4px 12px rgba(0, 0, 0, 0.1)'),
        clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
        position: 'relative',
        transform: hover ? 'translateY(-2px)' : 'none'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        onSelect?.(w.id === isSelected ? null : w.id)
        onOpenDetail?.(w)
      }}
    >
      {/* Dynamic Status Vertical Line */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: c.color, boxShadow: `0 0 8px ${c.color}` }} />

      <div style={{ transform: 'scale(1.1)', flexShrink: 0 }}>
        <Favicon url={w.url} name={w.name} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span
            style={{
              fontSize: '15px', fontWeight: 1000, fontFamily: '"Inter", sans-serif', color: textColor,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, lineHeight: 1.1
            }}
            title={w.name}
          >
            {w.name}
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 900,
            color: !w.status_code ? '#ef4444' : (isOnline ? '#10b981' : c.color),
            fontFamily: '"Inter", sans-serif',
            background: isDark ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.03)',
            border: `1px solid ${!w.status_code ? '#ef444433' : c.color + '33'}`,
            padding: '2px 8px',
            borderRadius: 4,
            flexShrink: 0
          }}>
            {w.status_code ? `HTTP ${w.status_code}` : t.timeout}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isDark ? 'rgba(0,0,0,0.05)' : `${c.color}15`, padding: '2px 8px', borderRadius: 4, border: `1px solid ${c.color}33`, flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, boxShadow: `0 0 6px ${c.color}`, animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.05em', color: c.color }}>
              {tStatus(w.status)}
            </span>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 1000, color: w.response_time_ms > 15000 ? 'var(--status-critical)' : subTextColor, fontFamily: '"Inter", sans-serif', flexShrink: 0 }}>
            {fmtMs(w.response_time_ms)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main StatusPanel ──────────────────────────────────────────

export default function StatusPanel({ websites, selectedId, onSelect, onOpenDetail, realtimeSnapshot, activeIncidents = [] }) {
  const { themeId, t } = useTheme()
  const isDark = themeId === 'theme-dark'
  // On phones the node list lives in the topology section (with its own search/
  // filter/sort), so this duplicate Live Feed is hidden and the graph takes over.
  const { isPhone } = useBreakpoint()
  const [showInfo, setShowInfo] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('status')

  const filtered = websites.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.url.toLowerCase().includes(search.toLowerCase())

    let matchesStatus = true
    if (statusFilter !== 'ALL') {
      matchesStatus = w.status === statusFilter
    }

    return matchesSearch && matchesStatus
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'status') {
      const order = { OFFLINE: 0, CRITICAL: 1, WARNING: 2, ONLINE: 4, UNKNOWN: 5 }
      return (order[a.status] ?? 6) - (order[b.status] ?? 6)
    }
    if (sortBy === 'a-z') {
      return a.name.localeCompare(b.name)
    }
    if (sortBy === 'z-a') {
      return b.name.localeCompare(a.name)
    }
    if (sortBy === 'newest') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
    if (sortBy === 'oldest') {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0)
    }
    return 0
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', backdropFilter: 'blur(10px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flex: 1 }}>

      {/* Content Stack: Live Feed Top, Graph Bottom */}
      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* LIVE FEED SECTION (Top 60%) — hidden on phones (lives in topology there) */}
        {!isPhone && (
        <div style={{ height: '60%', display: 'flex', flexDirection: 'column', borderBottom: '2px solid var(--border)' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Row 1: Title and Info Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-sub)', letterSpacing: '0.05em' }}>
                🌐 {t.liveNodesFeed} ({sorted.length}/{websites.length})
              </span>
              <button
                onClick={() => setShowInfo(true)}
                style={{ background: 'var(--accent-light)', border: '1px solid var(--border)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', flexShrink: 0 }}
                title={t.learnStatus}
              >
                <Info size={12} />
              </button>
            </div>

            {/* Row 2: Search (full width) */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Search input — baris penuh sendiri agar tidak terpotong/tersembunyi */}
              <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.5 }}>🔍</span>
                <input
                  id="service-search"
                  name="service-search"
                  type="search"
                  aria-label={t.searchPlaceholder}
                  autoComplete="off"
                  style={{
                    width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text)', fontSize: 12, outline: 'none', transition: 'all 0.2s',
                    textOverflow: 'ellipsis'
                  }}
                  placeholder={t.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                )}
              </div>
            </div>

            {/* Row 3: Status & Sort controls */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Status filter */}
              <select
                id="status-filter"
                name="status-filter"
                aria-label={t.allStatus}
                style={{
                  flex: 1, padding: '7px 6px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text)', fontSize: 11, outline: 'none', cursor: 'pointer',
                  fontWeight: 700, minWidth: 0, textOverflow: 'ellipsis'
                }}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">{t.allStatus}</option>
                <option value="ONLINE">🟢 {t.online}</option>
                <option value="CRITICAL">🟡 {t.critical}</option>
                <option value="OFFLINE">🔴 {t.offline}</option>
              </select>

              {/* Sort by */}
              <select
                id="sort-by"
                name="sort-by"
                aria-label={t.sortLabel}
                style={{
                  flex: 1, padding: '7px 6px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text)', fontSize: 11, outline: 'none', cursor: 'pointer',
                  fontWeight: 700, minWidth: 0, textOverflow: 'ellipsis'
                }}
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="status">{t.sortLabel}</option>
                <option value="a-z">{t.azLabel}</option>
                <option value="z-a">{t.zaLabel}</option>
                <option value="newest">{t.newestLabel}</option>
                <option value="oldest">{t.oldestLabel}</option>
              </select>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
            {sorted.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '30px 0' }}>
                {search || statusFilter !== 'ALL' ? (
                  <div>
                    {t.noMatchingNodes}
                    <button
                      onClick={() => { setSearch(''); setStatusFilter('ALL'); setSortBy('status') }}
                      style={{ display: 'block', margin: '8px auto', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                    >
                      {t.resetFilters}
                    </button>
                  </div>
                ) : t.noServicesConfigured}
              </div>
            )}
            {sorted.map(w => (
              <ServiceRow
                key={w.id}
                w={w}
                isSelected={selectedId === w.id}
                onSelect={onSelect}
                onOpenDetail={onOpenDetail}
                isDark={isDark}
              />
            ))}
          </div>
        </div>

        )}

        {/* GRAPH SECTION (Bottom 40%; full height on phones since the feed is hidden) */}
        <div style={{ height: isPhone ? '100%' : '40%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '10px' }}>
            <MonitoringGraph realtimeSnapshot={realtimeSnapshot} />
          </div>
        </div>

      </div>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}
