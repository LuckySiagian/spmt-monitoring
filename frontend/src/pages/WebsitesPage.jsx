import { useState, useEffect } from 'react'
import { websiteAPI } from '../services/api'
import { useAuth } from '../store/auth'
import Badge from '../components/common/Badge'

const Modal = ({ title, onClose, children }) => (
  <div style={mStyles.overlay}>
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
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
    <label style={mStyles.label}>{label}</label>
    <input style={mStyles.input} {...props} />
  </div>
)

const Select = ({ label, options, value, onChange, ...props }) => {
  const exists = options.some(opt => opt.val === value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
      <label style={mStyles.label}>{label}</label>
      <select 
        style={mStyles.input} 
        value={value} 
        onChange={e => onChange(parseInt(e.target.value))} 
        {...props}
      >
        {!exists && value && <option value={value}>{value} Seconds (Current)</option>}
        {options.map(opt => <option key={opt.val} value={opt.val}>{opt.lbl}</option>)}
      </select>
    </div>
  )
}

const Textarea = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
    <label style={mStyles.label}>{label}</label>
    <textarea style={{ ...mStyles.input, height: 60, resize: 'none' }} {...props} />
  </div>
)

// Replaced local StatusBadge with common Badge component

export default function WebsitesPage({ websites, onWebsiteUpdate }) {
  const { isAdmin } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ name: '', url: '', description: '', interval_seconds: 60 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Search & Recommendations State
  const [searchTerm, setSearchTerm] = useState('')
  const [showRecs, setShowRecs] = useState(false)

  const openAdd = () => {
    setForm({ name: '', url: '', description: '', interval_seconds: 60 })
    setError('')
    setShowAdd(true)
  }

  const openEdit = (w) => {
    setForm({ name: w.name, url: w.url, description: w.description, interval_seconds: w.interval_seconds })
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
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await websiteAPI.delete(deleteTarget.id)
      setDeleteTarget(null)
      onWebsiteUpdate?.() // Triggers global reload in App.jsx
    } catch (err) {
      console.error(err)
    }
  }

  // Filtering Logic
  const filteredWebsites = websites.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    w.url.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
        <div style={{ flex: 1 }}>
          <div style={wStyles.title}>Website Management</div>
          <div style={wStyles.sub}>{websites.length} / 100 websites configured</div>
        </div>

        {/* --- SEARCH BAR --- */}
        <div style={sStyles.searchWrapper}>
          <div style={sStyles.searchContainer}>
            <span style={sStyles.searchIcon}>🔍</span>
            <input 
              style={sStyles.searchInput} 
              placeholder="Search website name or URL..." 
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
                <div style={sStyles.recsHeader}>RECOMMENDATIONS</div>
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
        </div>

        {isAdmin && (
          <button 
            style={{ 
              ...wStyles.addBtn, 
              opacity: websites.length >= 100 ? 0.5 : 1,
              cursor: websites.length >= 100 ? 'not-allowed' : 'pointer',
              marginLeft: 16
            }} 
            onClick={websites.length >= 100 ? null : openAdd}
            title={websites.length >= 100 ? 'Limit 100 websites reached' : 'Add new website'}
          >
            {websites.length >= 100 ? 'Limit Reached' : '+ Add Website'}
          </button>
        )}
      </div>

      <div className="website-table-container" style={wStyles.tableContainer}>
        {websites.length === 0 ? (
          <div style={wStyles.empty}>No websites configured. {isAdmin && 'Click "Add Website" to begin.'}</div>
        ) : filteredWebsites.length === 0 ? (
          <div style={wStyles.empty}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            No websites match "<strong>{searchTerm}</strong>"
            <button onClick={() => setSearchTerm('')} style={{ display: 'block', margin: '12px auto', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>Clear Search</button>
          </div>
        ) : (
          <table className="website-table" style={wStyles.table}>
            <thead>
              <tr>
                <th style={wStyles.th}>NAME</th>
                <th style={wStyles.th} className="hide-mobile">URL</th>
                <th style={wStyles.th} className="hide-mobile">INTERVAL</th>
                <th style={wStyles.th}>STATUS</th>
                <th style={wStyles.th} className="hide-mobile">HTTP</th>
                <th style={wStyles.th}>RESPONSE</th>
                <th style={wStyles.th} className="hide-mobile">SSL</th>
                <th style={wStyles.th} className="hide-mobile">LAST CHECKED</th>
                {isAdmin && <th style={wStyles.th}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filteredWebsites.map(w => (
                <tr key={w.id} style={wStyles.tr}>
                  <td style={wStyles.td}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{w.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }} className="hide-mobile">{w.description}</div>
                  </td>
                  <td style={wStyles.td} className="hide-mobile"><a href={w.url} target="_blank" rel="noreferrer" style={wStyles.link}>{w.url}</a></td>
                  <td style={wStyles.td} className="hide-mobile">{w.interval_seconds}s</td>
                  <td style={wStyles.td}><Badge status={w.status} /></td>
                  <td style={wStyles.td} className="hide-mobile">{w.status_code ?? '—'}</td>
                  <td style={{ ...wStyles.td, color: w.response_time_ms > 3000 ? '#f59e0b' : '#10b981' }}>
                    {w.response_time_ms != null ? `${w.response_time_ms}ms` : '—'}
                  </td>
                  <td style={{ ...wStyles.td, color: w.ssl_valid ? '#10b981' : w.ssl_valid === false ? '#ef4444' : '#4a5568' }} className="hide-mobile">
                    {w.ssl_valid == null ? '—' : w.ssl_valid ? '✓' : '✗'}
                  </td>
                  <td style={{ ...wStyles.td, fontSize: 11, color: '#4a5568' }} className="hide-mobile">
                    {w.last_checked ? new Date(w.last_checked).toLocaleTimeString('id-ID', { hour12: false }) : '—'}
                  </td>
                  {isAdmin && (
                    <td style={wStyles.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={wStyles.editBtn} onClick={() => openEdit(w)}>Edit</button>
                        <button style={wStyles.delBtn} onClick={() => setDeleteTarget(w)}>Delete</button>
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
        <Modal title={editTarget ? 'Edit Website' : 'Add Website'} onClose={() => { setShowAdd(false); setEditTarget(null) }}>
          <form onSubmit={handleSave}>
            <Input label="NAME *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Website" required />
            <Input label="URL *" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com" required />
            <Textarea label="DESCRIPTION" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            <Select 
              label="MONITORING INTERVAL" 
              value={form.interval_seconds} 
              onChange={val => setForm(f => ({ ...f, interval_seconds: val }))}
              options={[
                { val: 30, lbl: '30 Seconds (Fast)' },
                { val: 60, lbl: '60 Seconds (Recommended)' },
                { val: 120, lbl: '120 Seconds (Normal)' },
              ]}
            />
            {error && <div style={mStyles.error}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={mStyles.cancelBtn} onClick={() => { setShowAdd(false); setEditTarget(null) }}>Cancel</button>
              <button type="submit" style={mStyles.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Confirm Delete" onClose={() => setDeleteTarget(null)}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            Delete <strong style={{ color: 'var(--text)' }}>{deleteTarget.name}</strong>? This will also remove all monitoring logs.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={mStyles.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button style={{ ...mStyles.saveBtn, background: '#ef4444' }} onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const wStyles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 10px', gap: 8, overflow: 'hidden', background: 'var(--bg-main)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, paddingBottom: '10px' },
  title: { fontSize: 24, fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.02em' },
  sub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  addBtn: {
    background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: 'var(--text)',
    border: 'none', borderRadius: 6, padding: '12px 24px',
    fontSize: 16, fontWeight: 900, letterSpacing: '0.05em', cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(59,130,246,0.3)',
  },
  tableContainer: { flex: 1, overflowY: 'auto', background: 'var(--bg-card)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 10, boxShadow: 'var(--shadow)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '14px 18px', textAlign: 'left', fontSize: 13, fontWeight: 800, color: 'var(--text-sub)', letterSpacing: '0.1em', borderBottom: '1px solid rgba(99,102,241,0.10)', background: 'var(--bg-header)', position: 'sticky', top: 0 },
  tr: { borderBottom: '1px solid rgba(99,102,241,0.07)', transition: 'background 0.15s' },
  td: { padding: '16px 18px', fontSize: 16, color: 'var(--text-muted)', verticalAlign: 'middle' },
  badge: { borderRadius: 4, padding: '4px 10px', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' },
  link: { color: '#3b82f6', textDecoration: 'none', fontSize: 14 },
  editBtn: { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: 4, padding: '6px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 800 },
  delBtn: { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 4, padding: '6px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 800 },
  empty: { textAlign: 'center', color: '#4a5568', padding: '48px', fontSize: 13 },
}

const mStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 12, width: 440, boxShadow: 'var(--shadow)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 22, fontWeight: 900, color: 'var(--text)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 24, cursor: 'pointer' },
  body: { padding: '24px' },
  label: { fontSize: 13, fontWeight: 800, color: 'var(--text-sub)', letterSpacing: '0.1em', marginBottom: 6 },
  input: { background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', color: 'var(--text)', fontSize: 16, outline: 'none', width: '100%' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 12 },
  cancelBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer' },
  saveBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}

const sStyles = {
  searchWrapper: { flex: 1, maxWidth: 500, margin: '0 20px' },
  searchContainer: { position: 'relative', width: '100%' },
  searchIcon: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 },
  searchInput: { 
    width: '100%', padding: '10px 40px 10px 38px', borderRadius: 20, 
    border: '1px solid var(--border)', background: 'var(--bg-card)', 
    color: 'var(--text)', fontSize: 13, outline: 'none', transition: 'all 0.2s',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
  },
  clearBtn: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 4 },
  recsDropdown: { 
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, 
    background: 'var(--bg-card)', border: '1px solid var(--border)', 
    borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', 
    zIndex: 1000, overflow: 'hidden', animation: 'fadeIn 0.2s ease' 
  },
  recsHeader: { padding: '10px 14px', fontSize: 9, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.03)', borderBottom: '1px solid var(--border)' },
  recItem: { padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s', borderBottom: '1px solid rgba(99,102,241,0.05)' },
  recName: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  recUrl: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 },
  mark: { background: 'var(--accent-light)', color: 'var(--accent)', padding: '0 1px', borderRadius: 2 },
}
