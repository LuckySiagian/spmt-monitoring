import { useState, useEffect } from 'react'
import { websiteAPI } from '../services/api'
import { useAuth } from '../store/auth'

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

const Select = ({ label, options, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
    <label style={mStyles.label}>{label}</label>
    <select style={mStyles.input} {...props}>
      {options.map(opt => <option key={opt.val} value={opt.val}>{opt.lbl}</option>)}
    </select>
  </div>
)

const Textarea = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
    <label style={mStyles.label}>{label}</label>
    <textarea style={{ ...mStyles.input, height: 60, resize: 'none' }} {...props} />
  </div>
)

const StatusBadge = ({ status }) => {
  const map = {
    ONLINE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    CRITICAL: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    OFFLINE: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  }
  const c = map[status] || { bg: 'var(--bg-main)', color: '#4a5568', border: 'var(--border)' }
  return (
    <span style={{ ...wStyles.badge, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {status || 'PENDING'}
    </span>
  )
}

export default function WebsitesPage({ onWebsiteUpdate }) {
  const { isAdmin } = useAuth()
  const [websites, setWebsites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ name: '', url: '', description: '', interval_seconds: 3 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async (signal) => {
    try {
      const res = await websiteAPI.getAll({ signal })
      setWebsites(res.data || [])
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [])

  const openAdd = () => {
    setForm({ name: '', url: '', description: '', interval_seconds: 3 })
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
      await load()
      setShowAdd(false)
      setEditTarget(null)
      onWebsiteUpdate?.()
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
      await load()
      setDeleteTarget(null)
      onWebsiteUpdate?.()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div style={wStyles.page}>
      <div style={wStyles.header}>
        <div>
          <div style={wStyles.title}>Website Management</div>
          <div style={wStyles.sub}>{websites.length} websites configured</div>
        </div>
        {isAdmin && (
          <button style={wStyles.addBtn} onClick={openAdd}>
            + ADD WEBSITE
          </button>
        )}
      </div>

      <div className="website-table-container" style={wStyles.tableContainer}>
        {loading ? (
          <div style={wStyles.empty}>Loading...</div>
        ) : websites.length === 0 ? (
          <div style={wStyles.empty}>No websites configured. {isAdmin && 'Click "Add Website" to begin.'}</div>
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
              {websites.map(w => (
                <tr key={w.id} style={wStyles.tr}>
                  <td style={wStyles.td}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{w.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }} className="hide-mobile">{w.description}</div>
                  </td>
                  <td style={wStyles.td} className="hide-mobile"><a href={w.url} target="_blank" rel="noreferrer" style={wStyles.link}>{w.url}</a></td>
                  <td style={wStyles.td} className="hide-mobile">{w.interval_seconds}s</td>
                  <td style={wStyles.td}><StatusBadge status={w.status} /></td>
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
              onChange={e => setForm(f => ({ ...f, interval_seconds: parseInt(e.target.value) }))}
              options={[
                { val: 1, lbl: '1 Second (Ultra Fast)' },
                { val: 2, lbl: '2 Seconds (Fast)' },
                { val: 3, lbl: '3 Seconds (Standard NOC)' },
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
  title: { fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' },
  sub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  addBtn: {
    background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: 'var(--text)',
    border: 'none', borderRadius: 6, padding: '8px 16px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(59,130,246,0.3)',
  },
  tableContainer: { flex: 1, overflowY: 'auto', background: 'var(--bg-card)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 10, boxShadow: 'var(--shadow)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.1em', borderBottom: '1px solid rgba(99,102,241,0.10)', background: 'var(--bg-header)', position: 'sticky', top: 0 },
  tr: { borderBottom: '1px solid rgba(99,102,241,0.07)', transition: 'background 0.15s' },
  td: { padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', verticalAlign: 'middle' },
  badge: { borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' },
  link: { color: '#3b82f6', textDecoration: 'none', fontSize: 11 },
  editBtn: { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  delBtn: { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  empty: { textAlign: 'center', color: '#4a5568', padding: '48px', fontSize: 13 },
}

const mStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 12, width: 440, boxShadow: 'var(--shadow)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' },
  body: { padding: '20px' },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.1em' },
  input: { background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 12 },
  cancelBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer' },
  saveBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}
