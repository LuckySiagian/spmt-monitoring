import { useState, useEffect } from 'react'
import { userAPI, userAdminAPI } from '../services/api'
import { useAuth } from '../store/auth'

const RoleBadge = ({ role }) => {
  const map = {
    superadmin: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
    admin: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
    viewer: { bg: 'rgba(148,163,184,0.1)', color: 'var(--text-sub)', border: 'rgba(148,163,184,0.2)' },
  }
  const c = map[role] || map.viewer
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
      {role?.toUpperCase()}
    </span>
  )
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [regForm, setRegForm] = useState({ username: '', password: '', role: 'viewer' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [regError, setRegError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const load = async () => {
    try {
      const res = await userAPI.getAll()
      setUsers(res.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const adminCount = users.filter(u => u.role === 'admin').length

  const handlePromote = async (userId) => {
    try {
      await userAPI.promote(userId)
      setActionMsg('User promoted to Admin')
      await load()
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e) {
      setActionMsg(e.response?.data?.error || 'Failed to promote')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const handleDemote = async (userId) => {
    try {
      await userAPI.demote(userId)
      setActionMsg('User demoted to Viewer')
      await load()
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e) {
      setActionMsg(e.response?.data?.error || 'Failed to demote')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setSaving(true); setRegError('')
    try {
      await userAdminAPI.create(regForm)
      setShowRegister(false)
      setRegForm({ username: '', password: '', role: 'viewer' })
      await load()
      setActionMsg('User created successfully')
      setTimeout(() => setActionMsg(''), 3000)
    } catch (err) {
      setRegError(err.response?.data?.error || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (userId) => {
    try {
      await userAdminAPI.delete(userId)
      setDeleteTarget(null)
      await load()
      setActionMsg('User deleted')
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e) {
      setActionMsg(e.response?.data?.error || 'Failed to delete')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>User Management</div>
          <div style={styles.sub}>
            {users.length} users · {adminCount}/3 admins used
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.addBtn} onClick={() => setShowRegister(true)}>
            + CREATE USER
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={styles.actionMsg}>{actionMsg}</div>
      )}

      {/* Admin limit bar */}
      <div style={styles.limitBar}>
        <span style={styles.limitLabel}>ADMIN SLOTS</span>
        <div style={styles.limitTrack}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              ...styles.limitSlot,
              background: i < adminCount ? '#3b82f6' : 'var(--border)',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: adminCount >= 3 ? '#ef4444' : '#4a5568' }}>
          {adminCount}/3
        </span>
      </div>

      <div style={styles.tableContainer}>
        {loading ? (
          <div style={styles.empty}>Loading...</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['USERNAME', 'ROLE', 'CREATED AT', 'ACTIONS'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{
                  ...styles.tr,
                  background: u.id === currentUser?.id ? 'rgba(59,130,246,0.04)' : '',
                }}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={styles.avatar}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: 'var(--text)', fontWeight: 600 }}>{u.username}</div>
                        {u.id === currentUser?.id && <div style={{ fontSize: 10, color: '#6366f1' }}>You</div>}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}><RoleBadge role={u.role} /></td>
                  <td style={{ ...styles.td, color: 'var(--text-muted)', fontSize: 11 }}>
                    {new Date(u.created_at).toLocaleString('id-ID')}
                  </td>
                  <td style={styles.td}>
                    {u.role === 'superadmin' ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Protected</span>
                    ) : u.id === currentUser?.id ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Current user</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.role === 'viewer' && (
                          <button
                            style={{ ...styles.promoteBtn, opacity: adminCount >= 3 ? 0.4 : 1 }}
                            onClick={() => handlePromote(u.id)}
                            disabled={adminCount >= 3}
                            title={adminCount >= 3 ? 'Max 3 admins reached' : 'Promote to Admin'}
                          >
                            ↑ Promote
                          </button>
                        )}
                        {u.role === 'admin' && (
                          <button style={styles.demoteBtn} onClick={() => handleDemote(u.id)}>
                            ↓ Demote
                          </button>
                        )}
                        <button style={styles.deleteBtn} onClick={() => setDeleteTarget(u)}>
                          🗑
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div style={mStyles.overlay}>
          <div style={{ ...mStyles.modal, width: 320, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Delete User</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 24 }}>
              Delete <strong style={{ color: 'var(--text)' }}>{deleteTarget.username}</strong>? This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button style={mStyles.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button style={{ ...mStyles.saveBtn, background: '#dc2626' }} onClick={() => handleDelete(deleteTarget.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <div style={mStyles.overlay}>
          <div style={mStyles.modal}>
            <div style={mStyles.mHeader}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Create New User</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowRegister(false)}>✕</button>
            </div>
            <form onSubmit={handleRegister} style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>USERNAME</label>
                <input style={mStyles.input} value={regForm.username} onChange={e => setRegForm(f => ({ ...f, username: e.target.value }))} placeholder="username" required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>PASSWORD</label>
                <input style={mStyles.input} type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} placeholder="password (min 6 chars)" required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>ROLE</label>
                <select style={{ ...mStyles.input, cursor: 'pointer' }} value={regForm.role} onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {regError && <div style={mStyles.error}>{regError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" style={mStyles.cancelBtn} onClick={() => setShowRegister(false)}>Cancel</button>
                <button type="submit" style={mStyles.saveBtn} disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 10px', gap: 8, overflow: 'hidden', background: 'var(--bg-main)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, paddingBottom: '10px' },
  title: { fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' },
  sub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  addBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: 'var(--text)', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer' },
  actionMsg: { background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: 6, padding: '8px 14px', fontSize: 12, flexShrink: 0 },
  limitBar: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  limitLabel: { fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' },
  limitTrack: { display: 'flex', gap: 4 },
  limitSlot: { width: 40, height: 8, borderRadius: 2, transition: 'background 0.3s' },
  tableContainer: { flex: 1, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', borderBottom: '2px solid var(--border)', background: 'var(--bg-header)', position: 'sticky', top: 0 },
  tr: { borderBottom: '1px solid rgba(99,102,241,0.07)' },
  td: { padding: '12px 14px', fontSize: 13, color: 'var(--text-sub)' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  promoteBtn: { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  demoteBtn: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  deleteBtn: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  empty: { textAlign: 'center', color: 'var(--text-muted)', padding: '48px', fontSize: 13 },
}

const mStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 12, width: 400, boxShadow: 'var(--shadow)' },
  mHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' },
  label: { display: 'block', fontSize: 9, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 4 },
  input: { background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 12 },
  cancelBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer' },
  saveBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
}
