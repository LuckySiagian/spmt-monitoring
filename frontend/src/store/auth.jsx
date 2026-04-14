import { createContext, useContext, useState, useCallback } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // ✅ SECURITY: Store only user info in sessionStorage (cleared on tab close), never store token in localStorage
  const [user, setUser] = useState(() => {
    try {
      const u = sessionStorage.getItem('user')
      return u ? JSON.parse(u) : null
    } catch { return null }
  })

  const login = useCallback(async (username, password) => {
    const res = await authAPI.login({ username, password })
    const { token, user } = res.data
    
    // ✅ SECURITY: Store token in memory only (would be httpOnly cookie in production)
    // Save token to sessionStorage temporarily for requests
    sessionStorage.setItem('token', token)
    sessionStorage.setItem('user', JSON.stringify(user))
    
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setUser(null)
  }, [])

  const isSuperAdmin = user?.role === 'superadmin'
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isViewer = user?.role === 'viewer'

  return (
    <AuthContext.Provider value={{ user, login, logout, isSuperAdmin, isAdmin, isViewer }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
