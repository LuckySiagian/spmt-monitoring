import { useState, useEffect } from 'react'
import { userAPI, userAdminAPI } from '../services/api'
import { useAuth } from '../store/auth'
import { useTheme } from '../store/theme'

import Badge from '../components/common/Badge'

const LOCALE_MAP = { id: 'id-ID', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU' }

const RoleBadge = ({ role }) => {
  const map = {
    superadmin: { color: '#8b5cf6', label: 'SUPERADMIN' },
    admin: { color: '#3b82f6', label: 'ADMIN' },
    adminpelindo: { color: '#10b981', label: 'ADMIN PELINDO' },
    viewer: { color: 'var(--text-muted)', label: 'VIEWER' },
  }
  const c = map[role] || map.viewer
  return (
    <span style={{ 
      background: `${c.color}15`, color: c.color, border: `1px solid ${c.color}33`, 
      borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 900, letterSpacing: '0.05em' 
    }}>
      {c.label}
    </span>
  )
}

export default function UsersPage({ users, onUserUpdate }) {
  const { user: currentUser } = useAuth()
  const { t, lang } = useTheme()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [showRegister, setShowRegister] = useState(false)
  const [regForm, setRegForm] = useState({ username: '', password: '', email: '', telegram_id: '', role: 'viewer' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [approveTarget, setApproveTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [regError, setRegError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const pendingUsers = users.filter(u => u.status === 'pending')
  const activeUsers = users.filter(u => u.status !== 'pending')
  const adminCount = users.filter(u => u.role === 'admin').length

  const handlePromote = async (userId) => {
    try {
      await userAPI.promote(userId)
      setActionMsg('User promoted to Admin')
      onUserUpdate?.()
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
      onUserUpdate?.()
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e) {
      setActionMsg(e.response?.data?.error || 'Failed to demote')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const handleApprove = async (userId) => {
    try {
      await userAdminAPI.approve(userId)
      setApproveTarget(null)
      onUserUpdate?.()
      setActionMsg(t.userApprovedMsg || 'User approved — they can now log in')
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e) {
      setActionMsg(e.response?.data?.error || 'Failed to approve')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const handleReject = async (userId) => {
    try {
      await userAdminAPI.reject(userId)
      setRejectTarget(null)
      onUserUpdate?.()
      setActionMsg(t.userRejectedMsg || 'Registration rejected')
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e) {
      setActionMsg(e.response?.data?.error || 'Failed to reject')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setSaving(true); setRegError('')
    try {
      await userAdminAPI.create(regForm)
      setShowRegister(false)
      setRegForm({ username: '', password: '', email: '', telegram_id: '', role: 'viewer' })
      onUserUpdate?.()
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
      onUserUpdate?.()
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
          <div style={styles.title}>{t.userManagement}</div>
          <div style={styles.sub}>
            {users.length} {t.usersLabel} · {adminCount}/3 {t.adminsUsed}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.addBtn} onClick={() => setShowRegister(true)}>
            {t.createUserBtn}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={styles.actionMsg}>{actionMsg}</div>
      )}

      {/* Pending Registrations — needs admin confirmation */}
      {pendingUsers.length > 0 && (
        <div style={styles.pendingBox}>
          <div style={styles.pendingHeader}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <span style={{ fontWeight: 900, color: '#f59e0b', fontSize: 15, letterSpacing: '0.02em' }}>
              {t.pendingApprovals || 'Pending Registrations'}
            </span>
            <span style={styles.pendingCountPill}>{pendingUsers.length}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {t.pendingApprovalsSub || 'New users awaiting your confirmation before they can log in.'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingUsers.map(u => (
              <div key={u.id} style={styles.pendingRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ ...styles.avatar, background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>
                    {u.username[0].toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16 }}>{u.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.email || '—'}{u.telegram_id ? ` · 📱 ${u.telegram_id}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button style={styles.approveBtn} onClick={() => setApproveTarget(u)} title={t.approveTooltip || 'Approve registration'}>
                    ✓ {t.approveBtn || 'Approve'}
                  </button>
                  <button style={styles.rejectBtn} onClick={() => setRejectTarget(u)} title={t.rejectTooltip || 'Reject registration'}>
                    ✕ {t.rejectBtn || 'Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin limit bar */}
      <div style={styles.limitBar}>
        <span style={styles.limitLabel}>{t.adminSlots}</span>
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
        {!activeUsers || activeUsers.length === 0 ? (
          <div style={styles.empty}>{t.noUsersFound}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>{t.thUsername}</th>
                <th style={styles.th}>{t.thRole}</th>
                <th style={styles.th} className="hide-mobile">{t.thCreatedAt}</th>
                <th style={styles.th}>{t.thActions}</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.map(u => (
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
                        <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 17 }}>{u.username}</div>
                        {u.id === currentUser?.id && <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700 }}>{t.youLabel}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}><RoleBadge role={u.role} /></td>
                  <td className="hide-mobile" style={{ ...styles.td, color: 'var(--text-muted)', fontSize: 11 }}>
                    {new Date(u.created_at).toLocaleString(locale)}
                  </td>
                  <td style={styles.td}>
                    {u.role === 'superadmin' ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.protectedLabel}</span>
                    ) : u.id === currentUser?.id ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.currentUserLabel}</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.role === 'viewer' && (
                          <button
                            style={{ ...styles.promoteBtn, opacity: adminCount >= 3 ? 0.4 : 1 }}
                            onClick={() => handlePromote(u.id)}
                            disabled={adminCount >= 3}
                            title={adminCount >= 3 ? t.maxAdminsReached : t.promoteToAdmin}
                          >
                            {t.promoteBtn}
                          </button>
                        )}
                        {u.role === 'admin' && (
                          <button style={styles.demoteBtn} onClick={() => handleDemote(u.id)}>
                            {t.demoteBtn}
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
          <div style={{ ...mStyles.modal, width: 'min(320px, 94vw)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t.deleteUserTitle}</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 24 }}>
              {t.deleteUserConfirmPrefix} <strong style={{ color: 'var(--text)' }}>{deleteTarget.username}</strong>{t.cannotBeUndone}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button style={mStyles.cancelBtn} onClick={() => setDeleteTarget(null)}>{t.cancel}</button>
              <button style={{ ...mStyles.saveBtn, background: '#dc2626' }} onClick={() => handleDelete(deleteTarget.id)}>{t.delete}</button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirm Modal */}
      {approveTarget && (
        <div style={mStyles.overlay}>
          <div style={{ ...mStyles.modal, width: 'min(360px, 94vw)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>{t.approveUserTitle || 'Approve Registration'}</div>
            <div style={{ fontSize: 14, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.5 }}>
              {t.approveUserConfirmPrefix || 'Allow user'} <strong style={{ color: 'var(--text)' }}>{approveTarget.username}</strong> {t.approveUserConfirmSuffix || 'to create a new account?'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button style={mStyles.cancelBtn} onClick={() => setApproveTarget(null)}>{t.cancel}</button>
              <button style={{ ...mStyles.saveBtn, background: '#10b981' }} onClick={() => handleApprove(approveTarget.id)}>{t.approveBtn || 'Approve'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirm Modal */}
      {rejectTarget && (
        <div style={mStyles.overlay}>
          <div style={{ ...mStyles.modal, width: 'min(360px, 94vw)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚫</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>{t.rejectUserTitle || 'Reject Registration'}</div>
            <div style={{ fontSize: 14, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.5 }}>
              {t.rejectUserConfirmPrefix || 'You are rejecting'} <strong style={{ color: 'var(--text)' }}>{rejectTarget.username}</strong> {t.rejectUserConfirmSuffix || 'as a new user. Their registration will be removed.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button style={mStyles.cancelBtn} onClick={() => setRejectTarget(null)}>{t.cancel}</button>
              <button style={{ ...mStyles.saveBtn, background: '#dc2626' }} onClick={() => handleReject(rejectTarget.id)}>{t.rejectBtn || 'Reject'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <div style={mStyles.overlay}>
          <div style={mStyles.modal}>
            <div style={mStyles.mHeader}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t.createNewUser}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowRegister(false)}>✕</button>
            </div>
            <form onSubmit={handleRegister} style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>{t.thUsername}</label>
                <input style={mStyles.input} value={regForm.username} onChange={e => setRegForm(f => ({ ...f, username: e.target.value }))} placeholder="username" required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>{t.fieldPassword}</label>
                <input style={mStyles.input} type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} placeholder={t.passwordMinPh} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>{t.thRole}</label>
                <select style={{ ...mStyles.input, cursor: 'pointer' }} value={regForm.role} onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="viewer">{t.roleViewer}</option>
                  <option value="admin">{t.roleAdmin}</option>
                  <option value="adminpelindo">{t.roleAdminPelindo}</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>{t.fieldEmail}</label>
                <input style={mStyles.input} type="email" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={mStyles.label}>{t.fieldTelegramOpt}</label>
                <input style={mStyles.input} type="text" value={regForm.telegram_id} onChange={e => setRegForm(f => ({ ...f, telegram_id: e.target.value }))} placeholder="@username or Chat ID" />
              </div>
              {regError && <div style={mStyles.error}>{regError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" style={mStyles.cancelBtn} onClick={() => setShowRegister(false)}>{t.cancel}</button>
                <button type="submit" style={mStyles.saveBtn} disabled={saving}>{saving ? t.creating : t.createUserSubmit}</button>
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
  title: { fontSize: 26, fontWeight: 1000, color: 'var(--primary)', letterSpacing: '-0.02em' },
  sub: { fontSize: 14, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 },
  addBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: 'var(--text)', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 900, letterSpacing: '0.05em', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' },
  actionMsg: { background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: 6, padding: '10px 18px', fontSize: 15, flexShrink: 0, fontWeight: 700 },
  limitBar: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  limitLabel: { fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' },
  limitTrack: { display: 'flex', gap: 4 },
  limitSlot: { width: 40, height: 8, borderRadius: 2, transition: 'background 0.3s' },
  tableContainer: { flex: 1, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)' },
  table: { width: '100%', minWidth: 640, borderCollapse: 'collapse' },
  th: { padding: '14px 18px', textAlign: 'left', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.1em', borderBottom: '2px solid var(--border)', background: 'var(--bg-header)', position: 'sticky', top: 0 },
  tr: { borderBottom: '1px solid rgba(99,102,241,0.07)' },
  td: { padding: '16px 18px', fontSize: 17, color: 'var(--text-sub)' },
  avatar: { width: 44, height: 44, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 900, fontSize: 18, flexShrink: 0 },
  promoteBtn: { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: 4, padding: '6px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 800 },
  demoteBtn: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 4, padding: '6px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 800 },
  deleteBtn: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 4, padding: '6px 10px', fontSize: 14, cursor: 'pointer' },
  empty: { textAlign: 'center', color: 'var(--text-muted)', padding: '48px', fontSize: 13 },
  pendingBox: { flexShrink: 0, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '14px 16px', boxShadow: '0 0 16px rgba(245,158,11,0.12)' },
  pendingHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  pendingCountPill: { background: '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 900, borderRadius: 10, padding: '1px 9px' },
  pendingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', flexWrap: 'wrap' },
  approveBtn: { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: 6, padding: '8px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 900 },
  rejectBtn: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: 6, padding: '8px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 900 },
}

const mStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--bg-header)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(400px, 94vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)' },
  mHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' },
  label: { display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 },
  input: { background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', color: 'var(--text)', fontSize: 17, outline: 'none', width: '100%' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '12px 16px', color: '#ef4444', fontSize: 15, marginBottom: 12 },
  cancelBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 8, padding: '12px 24px', fontSize: 16, cursor: 'pointer' },
  saveBtn: { background: 'linear-gradient(135deg,#2563eb,#3b82f6)', border: 'none', color: '#fff', borderRadius: 8, padding: '12px 28px', fontSize: 16, fontWeight: 900, cursor: 'pointer' },
}
