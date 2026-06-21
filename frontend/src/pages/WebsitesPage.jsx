import { useState } from 'react'
import { websiteAPI } from '../services/api'
import { useAuth } from '../store/auth'
import { useTheme } from '../store/theme'
import Badge from '../components/common/Badge'

const LOCALE_MAP = { id: 'id-ID', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU' }

const Modal = ({ title, onClose, children }) => (
  <div style={mStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div style={mStyles.modal}>
      <div style={mStyles.header}>
        <span style={mStyles.title}>{title}</span>
        <button style={mStyles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={mStyles.body}>{children}</div>
    </div>
  </div>
)

const Input = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
    <label style={mStyles.label}>{label}</label>
    <input style={mStyles.input} {...props} />
  </div>
)

const Select = ({ label, options, value, onChange, currentLabel = 'Seconds (Current)', ...props }) => {
  const exists = options.some(opt => opt.val === value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      <label style={mStyles.label}>{label}</label>
      <select
        style={mStyles.input}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        {...props}
      >
        {!exists && value && <option value={value}>{value} {currentLabel}</option>}
        {options.map(opt => <option key={opt.val} value={opt.val}>{opt.lbl}</option>)}
      </select>
    </div>
  )
}

const Textarea = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
    <label style={mStyles.label}>{label}</label>
    <textarea style={{ ...mStyles.input, height: 70, resize: 'none' }} {...props} />
  </div>
)

export default function WebsitesPage({ websites, onWebsiteUpdate }) {
  const { isAdmin } = useAuth()
  const { t, lang } = useTheme()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ name: '', url: '', description: '', interval_seconds: 60, save_screenshot: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hoveredRow, setHoveredRow] = useState(null)

  // Bulk selection (admin only)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  // Search & Recommendations State
  const [searchTerm, setSearchTerm] = useState('')
  const [showRecs, setShowRecs] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('a-z')

  const openAdd = () => {
    setForm({ name: '', url: '', description: '', interval_seconds: 60, save_screenshot: false })
    setError('')
    setShowAdd(true)
  }

  const openEdit = (w) => {
    setForm({ name: w.name, url: w.url, description: w.description, interval_seconds: w.interval_seconds, save_screenshot: false })
    setEditTarget(w)
    setError('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editTarget) {
        await websiteAPI.update(editTarget.id, form)
      } else {
        await websiteAPI.create(form)
      }
      setShowAdd(false)
      setEditTarget(null)
      onWebsiteUpdate?.() // Triggers global reload in App.jsx
    } catch (err) {
      setError(err.response?.data?.error || t.failedToSave)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await websiteAPI.delete(deleteTarget.id)
      setSelectedIds(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next })
      setDeleteTarget(null)
      onWebsiteUpdate?.() // Triggers global reload in App.jsx
    } catch (err) {
      console.error(err)
    }
  }

  // Filtering & Sorting Logic
  const filteredWebsites = websites.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          w.url.toLowerCase().includes(searchTerm.toLowerCase())
    
    let matchesStatus = true
    if (statusFilter !== 'ALL') {
      matchesStatus = w.status === statusFilter
    }
    
    return matchesSearch && matchesStatus
  })

  const sortedWebsites = [...filteredWebsites].sort((a, b) => {
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

  // ── Bulk selection logic ──
  const selectedWebsites = websites.filter(w => selectedIds.has(w.id))
  // Deleting ALL configured websites at once requires an extra typed confirmation
  const deletingAll = websites.length > 0 && selectedWebsites.length === websites.length
  const confirmMatches = confirmText.trim().toUpperCase() === (t.bulkDeleteAllKeyword || '').toUpperCase()
  const visibleSelectedCount = sortedWebsites.filter(w => selectedIds.has(w.id)).length
  const allVisibleSelected = sortedWebsites.length > 0 && visibleSelectedCount === sortedWebsites.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        sortedWebsites.forEach(w => next.delete(w.id))
      } else {
        sortedWebsites.forEach(w => next.add(w.id))
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const toggleSelectMode = () => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set()) // exiting select mode clears selection
      return !prev
    })
  }

  const handleBulkDelete = async () => {
    const ids = selectedWebsites.map(w => w.id)
    if (ids.length === 0) return
    setBulkDeleting(true)
    setBulkError('')
    try {
      // Single atomic transaction on the backend: all rows are deleted or none are
      await websiteAPI.bulkDelete(ids)
      setSelectedIds(new Set())
      setShowBulkDelete(false)
      setConfirmText('')
      onWebsiteUpdate?.() // Triggers global reload in App.jsx (reflects DB state)
    } catch (err) {
      // Atomic delete failed → nothing was removed, keep the selection for retry
      console.error(err)
      setBulkError(err.response?.data?.error || t.bulkDeleteFailed)
    } finally {
      setBulkDeleting(false)
    }
  }

  const openBulkDelete = () => {
    setBulkError('')
    setConfirmText('')
    setShowBulkDelete(true)
  }

  // Recommendation Logic (Unique matches from name and url)
  const recs = searchTerm.length > 0 
    ? websites.filter(w => 
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        w.url.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5)
    : []

  return (
    <div style={wStyles.page}>
      <div style={wStyles.header}>
        <div>
          <div style={wStyles.title}>{t.websiteManagement}</div>
          <div style={wStyles.sub}>{websites.length} / 100 {t.websitesConfigured}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* --- SEARCH BAR --- */}
          <div style={sStyles.searchContainer}>
            <span style={sStyles.searchIcon}>🔍</span>
            <input 
              style={sStyles.searchInput} 
              placeholder={t.searchWebsiteUrl}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setShowRecs(true)
              }}
              onFocus={() => setShowRecs(true)}
              onBlur={() => setTimeout(() => setShowRecs(false), 200)}
            />
            {searchTerm && <button onClick={() => setSearchTerm('')} style={sStyles.clearBtn}>✕</button>}
            
            {/* Recommendations Dropdown */}
            {showRecs && recs.length > 0 && (
              <div style={sStyles.recsDropdown}>
                <div style={sStyles.recsHeader}>{t.recommendations}</div>
                {recs.map(r => (
                  <div 
                    key={r.id} 
                    style={sStyles.recItem}
                    onClick={() => {
                      setSearchTerm(r.name)
                      setShowRecs(false)
                    }}
                  >
                    <div style={sStyles.recName}>
                      {r.name.toLowerCase().includes(searchTerm.toLowerCase()) ? (
                        <>
                          {r.name.substring(0, r.name.toLowerCase().indexOf(searchTerm.toLowerCase()))}
                          <mark style={sStyles.mark}>{r.name.substring(r.name.toLowerCase().indexOf(searchTerm.toLowerCase()), r.name.toLowerCase().indexOf(searchTerm.toLowerCase()) + searchTerm.length)}</mark>
                          {r.name.substring(r.name.toLowerCase().indexOf(searchTerm.toLowerCase()) + searchTerm.length)}
                        </>
                      ) : r.name}
                    </div>
                    <div style={sStyles.recUrl}>{r.url}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- STATUS FILTER --- */}
          <div style={fStyles.filterGroup}>
            <span style={fStyles.filterIcon}>🚦</span>
            <select
              style={fStyles.filterSelect}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">{t.allStatus}</option>
              <option value="ONLINE">🟢 {t.online}</option>
              <option value="CRITICAL">🟡 {t.critical}</option>
              <option value="OFFLINE">🔴 {t.offline}</option>
            </select>
          </div>

          {/* --- SORT BY --- */}
          <div style={fStyles.filterGroup}>
            <span style={fStyles.filterIcon}>↕️</span>
            <select
              style={fStyles.filterSelect}
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="a-z">{t.sortNameAz}</option>
              <option value="z-a">{t.sortNameZa}</option>
              <option value="newest">{t.sortNewestCreated}</option>
              <option value="oldest">{t.sortOldestCreated}</option>
            </select>
          </div>

          {isAdmin && (
            <button 
              style={{ 
                ...wStyles.addBtn, 
                opacity: websites.length >= 100 ? 0.5 : 1,
                cursor: websites.length >= 100 ? 'not-allowed' : 'pointer'
              }} 
              onClick={websites.length >= 100 ? null : openAdd}
              title={websites.length >= 100 ? t.limitReachedTitle : t.addNewWebsiteTitle}
            >
              {websites.length >= 100 ? t.limitReached : t.addWebsiteBtn}
            </button>
          )}
        </div>
      </div>

      {isAdmin && selectMode && selectedWebsites.length > 0 && (
        <div style={wStyles.bulkBar}>
          <div style={wStyles.bulkInfo}>
            <span style={wStyles.bulkCountBadge}>{selectedWebsites.length}</span>
            <span>{selectedWebsites.length} {t.selectedSuffix}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={wStyles.bulkClearBtn} onClick={clearSelection}>{t.clearSelectionBtn}</button>
            <button style={wStyles.bulkDeleteBtn} onClick={openBulkDelete}>🗑️ {t.deleteSelectedBtn}</button>
          </div>
        </div>
      )}

      <div className="website-table-container" style={wStyles.tableContainer}>
        {websites.length === 0 ? (
          <div style={wStyles.empty}>{t.noWebsitesConfigured} {isAdmin && t.clickAddWebsite}</div>
        ) : sortedWebsites.length === 0 ? (
          <div style={wStyles.empty}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            {t.noWebsitesMatch}
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setSortBy('a-z') }}
              style={{ display: 'block', margin: '12px auto', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
            >
              {t.resetFilters}
            </button>
          </div>
        ) : (
          <table className="website-table" style={wStyles.table}>
            <thead>
              <tr>
                <th style={{ ...wStyles.th, width: '16%' }}>{t.thWebsite}</th>
                <th style={{ ...wStyles.th, width: '16%' }}>{t.thUrlEndpoint}</th>
                <th style={{ ...wStyles.th, width: '7%', textAlign: 'center' }}>{t.thInterval}</th>
                <th style={{ ...wStyles.th, width: '10%', textAlign: 'center' }}>{t.thStatus}</th>
                <th style={{ ...wStyles.th, width: '11%', textAlign: 'center' }}>{t.thHealth}</th>
                <th style={{ ...wStyles.th, width: '8%', textAlign: 'center' }}>{t.thLatency}</th>
                <th style={{ ...wStyles.th, width: '6%', textAlign: 'center' }}>{t.thHttp}</th>
                <th style={{ ...wStyles.th, width: '10%', textAlign: 'center' }}>{t.thSsl}</th>
                <th style={{ ...wStyles.th, width: '13%', textAlign: 'center' }}>{t.thNetLatencies}</th>
                {isAdmin && (
                  <th style={{ ...wStyles.th, width: '13%', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      {selectMode && (
                        <input
                          type="checkbox"
                          style={wStyles.checkbox}
                          checked={allVisibleSelected}
                          ref={el => { if (el) el.indeterminate = someVisibleSelected }}
                          onChange={toggleSelectAll}
                          title={t.selectAllTitle}
                        />
                      )}
                      <span>{t.thActions}</span>
                      <button
                        style={{ ...wStyles.kebabBtn, ...(selectMode ? wStyles.kebabBtnActive : {}) }}
                        onClick={toggleSelectMode}
                        title={t.selectMode}
                      >⋮</button>
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedWebsites.map(w => (
                <tr 
                  key={w.id} 
                  onMouseEnter={() => setHoveredRow(w.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    ...wStyles.tr,
                    background: selectedIds.has(w.id)
                      ? 'rgba(59,130,246,0.08)'
                      : hoveredRow === w.id ? 'rgba(99,102,241,0.04)' : 'transparent'
                  }}
                >
                  {/* Column 1: WEBSITE */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '15px', letterSpacing: '-0.01em' }}>
                        {w.name}
                      </div>
                      {w.description && (
                        <div style={wStyles.descriptionBox} title={w.description}>
                          {w.description}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Column 2: URL / ENDPOINT */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <a href={w.url} target="_blank" rel="noreferrer" style={wStyles.link} title={w.url}>
                        {w.url} ↗
                      </a>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        IP: <strong style={{ fontFamily: 'monospace' }}>{w.ip_address || '—'}</strong>
                      </span>
                    </div>
                  </td>
                  
                  {/* Column 3: INTERVAL */}
                  <td style={wStyles.td}>
                    <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--text-sub)' }}>
                      {w.interval_seconds}s
                    </div>
                  </td>

                  {/* Column 4: STATUS */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <Badge status={w.status} />
                    </div>
                  </td>
                  
                  {/* Column 5: HEALTH */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ 
                        color: w.health_score >= 80 ? '#10b981' : w.health_score >= 50 ? '#f59e0b' : '#ef4444', 
                        fontWeight: 900, 
                        fontSize: '13px' 
                      }}>
                        {w.health_score != null ? `${w.health_score}%` : '—'}
                      </span>
                      {w.health_score != null && (
                        <div style={{ width: 60, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 2.5, overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${w.health_score}%`, 
                            height: '100%', 
                            background: w.health_score >= 80 ? '#10b981' : w.health_score >= 50 ? '#f59e0b' : '#ef4444',
                            borderRadius: 2.5
                          }} />
                        </div>
                      )}
                    </div>
                  </td>
                  
                  {/* Column 6: LATENCY */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: 850, 
                        color: w.response_time_ms > 2000 ? '#f59e0b' : w.response_time_ms > 0 ? '#10b981' : 'var(--text-muted)',
                        background: w.response_time_ms > 2000 ? 'rgba(245,158,11,0.08)' : w.response_time_ms > 0 ? 'rgba(16,185,129,0.08)' : 'transparent',
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: w.response_time_ms > 0 ? `1px solid ${w.response_time_ms > 2000 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}` : 'none'
                      }}>
                        {w.response_time_ms != null ? `${w.response_time_ms}ms` : '—'}
                      </span>
                    </div>
                  </td>

                  {/* Column 7: HTTP */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: 850, 
                        color: w.status_code >= 400 ? '#ef4444' : w.status_code >= 200 ? '#10b981' : 'var(--text-muted)',
                        background: w.status_code >= 400 ? 'rgba(239,68,68,0.08)' : w.status_code >= 200 ? 'rgba(16,185,129,0.08)' : 'transparent',
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: w.status_code > 0 ? `1px solid ${w.status_code >= 400 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}` : 'none'
                      }}>
                        {w.status_code ?? '—'}
                      </span>
                    </div>
                  </td>

                  {/* Column 8: SSL */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ 
                        color: w.ssl_valid ? '#10b981' : w.ssl_valid === false ? '#ef4444' : 'var(--text-muted)', 
                        fontWeight: 800,
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {w.ssl_valid ? `🔒 ${t.validLabel}` : w.ssl_valid === false ? `🔓 ${t.invalidLabel}` : '—'}
                      </span>
                      {w.ssl_expiry_date && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                          {t.exp}: {new Date(w.ssl_expiry_date).toLocaleDateString(locale)}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Column 9: NET LATENCIES */}
                  <td style={wStyles.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: '11px', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span>DNS: <strong>{w.dns_latency_ms ?? '0'}ms</strong></span>
                        <span>•</span>
                        <span>TLS: <strong>{w.tls_latency_ms ?? '0'}ms</strong></span>
                      </div>
                      <div>
                        <span>TTFB: <strong>{w.ttfb_latency_ms ?? '0'}ms</strong></span>
                      </div>
                    </div>
                  </td>

                  {/* Column 10: ACTIONS */}
                  {isAdmin && (
                    <td style={wStyles.td}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                        <button style={wStyles.editBtn} onClick={() => openEdit(w)}>✏️ {t.editBtn}</button>
                        <button style={wStyles.delBtn} onClick={() => setDeleteTarget(w)}>🗑️ {t.deleteBtn}</button>
                        {selectMode && (
                          <input
                            type="checkbox"
                            style={{ ...wStyles.checkbox, marginLeft: 2 }}
                            checked={selectedIds.has(w.id)}
                            onChange={() => toggleSelect(w.id)}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAdd || editTarget) && (
        <Modal title={editTarget ? t.editWebsiteTitle : t.addWebsiteModalTitle} onClose={() => { setShowAdd(false); setEditTarget(null) }}>
          <form onSubmit={handleSave}>
            <Input label={t.fieldName} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t.fieldNamePh} required />
            <Input label={t.fieldUrl} value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com" required />
            <Textarea label={t.fieldDescription} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t.fieldDescriptionPh} />
            <Select
              label={t.fieldInterval}
              currentLabel={t.secondsCurrent}
              value={form.interval_seconds}
              onChange={val => setForm(f => ({ ...f, interval_seconds: val }))}
              options={[
                { val: 30, lbl: t.interval30 },
                { val: 60, lbl: t.interval60 },
                { val: 120, lbl: t.interval120 },
              ]}
            />
            {error && <div style={mStyles.error}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" style={mStyles.cancelBtn} onClick={() => { setShowAdd(false); setEditTarget(null) }}>{t.cancel}</button>
              <button type="submit" style={mStyles.saveBtn} disabled={saving}>{saving ? t.saving : t.saveBtn}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title={t.confirmDeleteTitle} onClose={() => setDeleteTarget(null)}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13, lineHeight: 1.5 }}>
            {t.deleteConfirmPrefix} <strong style={{ color: 'var(--text)' }}>{deleteTarget.name}</strong>{t.deleteConfirmSuffix}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={mStyles.cancelBtn} onClick={() => setDeleteTarget(null)}>{t.cancel}</button>
            <button style={{ ...mStyles.saveBtn, background: 'linear-gradient(135deg, #dc2626, #ef4444)' }} onClick={handleDelete}>{t.delete}</button>
          </div>
        </Modal>
      )}

      {/* Bulk Delete Confirm */}
      {showBulkDelete && selectedWebsites.length > 0 && (
        <Modal title={t.bulkDeleteTitle} onClose={() => !bulkDeleting && setShowBulkDelete(false)}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
            {t.deleteConfirmPrefix} <strong style={{ color: 'var(--text)' }}>{selectedWebsites.length}</strong> {t.bulkDeleteUnit}{t.deleteConfirmSuffix}
          </p>
          <div style={mStyles.bulkList}>
            {selectedWebsites.map(w => (
              <div key={w.id} style={mStyles.bulkListItem}>
                <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{w.name}</strong>
                <span style={mStyles.bulkListUrl} title={w.url}>{w.url}</span>
              </div>
            ))}
          </div>

          {/* Extra verification when wiping EVERYTHING */}
          {deletingAll && (
            <>
              <div style={mStyles.dangerBanner}>⚠️ {t.bulkDeleteAllWarning}</div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sub)', marginBottom: 6, lineHeight: 1.5 }}>
                {t.bulkConfirmTypePrefix} <strong style={{ color: '#ef4444', letterSpacing: '0.04em' }}>{t.bulkDeleteAllKeyword}</strong> {t.bulkConfirmTypeSuffix}
              </label>
              <input
                style={{ ...mStyles.input, marginBottom: 4, borderColor: confirmText && !confirmMatches ? 'rgba(239,68,68,0.5)' : 'var(--border)' }}
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={t.bulkDeleteAllKeyword}
                disabled={bulkDeleting}
                autoFocus
              />
            </>
          )}

          {bulkError && <div style={{ ...mStyles.error, marginTop: 12, marginBottom: 0 }}>{bulkError}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={mStyles.cancelBtn} onClick={() => setShowBulkDelete(false)} disabled={bulkDeleting}>{t.cancel}</button>
            <button
              style={{
                ...mStyles.saveBtn,
                background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                opacity: (bulkDeleting || (deletingAll && !confirmMatches)) ? 0.5 : 1,
                cursor: (bulkDeleting || (deletingAll && !confirmMatches)) ? 'not-allowed' : 'pointer',
              }}
              onClick={handleBulkDelete}
              disabled={bulkDeleting || (deletingAll && !confirmMatches)}
            >
              {bulkDeleting ? t.processing : (deletingAll ? t.deleteAllBtn : t.delete)}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const wStyles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 20px', gap: 16, overflow: 'hidden', background: 'var(--bg-main)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  title: { fontSize: 24, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  addBtn: {
    background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff',
    border: 'none', borderRadius: 8, padding: '10px 18px',
    fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(59,130,246,0.25)', transition: 'transform 0.15s, opacity 0.15s',
  },
  tableContainer: { flex: 1, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' },
  table: { width: '100%', minWidth: 820, borderCollapse: 'collapse' },
  th: { padding: '14px 16px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-sub)', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 },
  tr: { borderBottom: '1px solid var(--border)', transition: 'background 0.2s ease' },
  td: { padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', verticalAlign: 'middle' },
  link: { color: '#3b82f6', textDecoration: 'none', fontSize: 13, wordBreak: 'break-all', fontWeight: 600 },
  descriptionBox: { 
    fontSize: 11, 
    color: 'var(--text-muted)', 
    marginTop: 2, 
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '180px',
    fontStyle: 'italic',
  },
  checkbox: { width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6', verticalAlign: 'middle' },
  kebabBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0, lineHeight: 1, fontSize: 16, fontWeight: 900, background: 'transparent', border: '1px solid transparent', borderRadius: 6, color: 'var(--text-sub)', cursor: 'pointer', transition: 'all 0.15s' },
  kebabBtnActive: { background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' },
  bulkBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, flexShrink: 0 },
  bulkInfo: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  bulkCountBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', borderRadius: 11, fontSize: 12, fontWeight: 800 },
  bulkClearBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' },
  bulkDeleteBtn: { background: 'linear-gradient(135deg, #dc2626, #ef4444)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.25)', transition: 'all 0.15s' },
  editBtn: { background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700, transition: 'all 0.15s' },
  delBtn: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700, transition: 'all 0.15s' },
  empty: { textAlign: 'center', color: '#4a5568', padding: '64px 24px', fontSize: 13 },
}

const mStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 16, width: 'min(450px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0 },
  title: { fontSize: 16, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.01em' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' },
  body: { padding: '20px 24px 24px', overflowY: 'auto' },
  label: { fontSize: 11, fontWeight: 800, color: 'var(--text-sub)', letterSpacing: '0.08em', marginBottom: 4 },
  input: { background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', transition: 'all 0.15s' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 11, marginBottom: 12 },
  cancelBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' },
  saveBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' },
  dangerBanner: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 12, fontWeight: 600, lineHeight: 1.5, marginBottom: 14 },
  bulkList: { maxHeight: 180, overflowY: 'auto', marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8 },
  bulkListItem: { padding: '8px 12px', fontSize: 12, color: 'var(--text-sub)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  bulkListUrl: { color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}

const sStyles = {
  searchContainer: { position: 'relative', width: 300, maxWidth: '100%' },
  searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.5 },
  searchInput: { 
    width: '100%', padding: '9px 36px 9px 32px', borderRadius: 8, 
    border: '1px solid var(--border)', background: 'var(--bg-card)', 
    color: 'var(--text)', fontSize: 12, outline: 'none', transition: 'all 0.2s',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
  },
  clearBtn: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 4 },
  recsDropdown: { 
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, 
    background: 'var(--bg-card)', border: '1px solid var(--border)', 
    borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', 
    zIndex: 1000, overflow: 'hidden' 
  },
  recsHeader: { padding: '8px 12px', fontSize: 8, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', background: 'rgba(99,102,241,0.03)', borderBottom: '1px solid var(--border)' },
  recItem: { padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s', borderBottom: '1px solid rgba(99,102,241,0.04)' },
  recName: { fontSize: 12, fontWeight: 700, color: 'var(--text)' },
  recUrl: { fontSize: 9, color: 'var(--text-muted)', marginTop: 2 },
  mark: { background: 'var(--accent-light)', color: 'var(--accent)', padding: '0 1px', borderRadius: 2 },
}

const fStyles = {
  filterGroup: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  filterIcon: {
    position: 'absolute',
    left: 10,
    fontSize: 12,
    pointerEvents: 'none',
  },
  filterSelect: {
    padding: '9px 12px 9px 28px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
  }
}
