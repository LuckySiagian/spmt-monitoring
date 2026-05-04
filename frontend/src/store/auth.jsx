import { createContext, useContext, useState, useCallback } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem('user')
      return u ? JSON.parse(u) : null
    } catch { return null }
  })

  const login = useCallback(async (username, password, turnstileToken) => {
    const res = await authAPI.login({ username, password, turnstile_token: turnstileToken })
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  const updateUser = useCallback((updatedUser) => {
    const newUser = { ...user, ...updatedUser }
    localStorage.setItem('user', JSON.stringify(newUser))
    setUser(newUser)
  }, [user])

  const isSuperAdmin = user?.role === 'superadmin'
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isViewer = user?.role === 'viewer'

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isSuperAdmin, isAdmin, isViewer }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
