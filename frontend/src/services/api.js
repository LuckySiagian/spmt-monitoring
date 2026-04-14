import axios from 'axios'

// ✅ SECURITY: Use HTTPS in production, HTTP only in development
const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  
  // Use HTTPS in production (secure), HTTP in dev
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  return `${protocol}//${window.location.hostname}:8080`
}
const BASE_URL = getBaseURL()

const api = axios.create({ baseURL: BASE_URL, headers: { 'Content-Type': 'application/json' } })

api.interceptors.request.use(config => {
  // ✅ SECURITY: Get token from sessionStorage instead of localStorage
  const token = sessionStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    if (!err.config?.url?.includes('/auth/login')) {
      sessionStorage.removeItem('token'); sessionStorage.removeItem('user')
      window.dispatchEvent(new CustomEvent('auth:logout'))
    }
  }
  return Promise.reject(err)
})

export const authAPI    = { login: d=>api.post('/auth/login',d), register: d=>api.post('/auth/register',d) }
export const websiteAPI = { getAll:(config)=>api.get('/websites', config), create:d=>api.post('/websites',d), update:(id,d)=>api.put(`/websites/${id}`,d), delete:id=>api.delete(`/websites/${id}`), getLogs:(id,l=100)=>api.get(`/websites/${id}/logs?limit=${l}`) }
export const dashboardAPI = { getSummary:(config)=>api.get('/dashboard/summary', config) }
export const userAPI    = { getAll:(config)=>api.get('/users', config), promote:id=>api.post('/users/promote',{user_id:id}), demote:id=>api.post('/users/demote',{user_id:id}) }
// ✅ SECURITY: Use WSS (secure WebSocket) in production, WS in development
export const WS_URL     = (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.hostname}:8080/ws`
})()
export default api
export const historyAPI = {
  getStatusHistory: (range='24h', start='', end='') => {
    if (range==='custom'&&start&&end) return api.get(`/dashboard/history?range=custom&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
    return api.get(`/dashboard/history?range=${range}`)
  },
}
export const eventsAPI       = { getAll:(l=100, config)=>api.get(`/dashboard/events?limit=${l}`, config), getByWebsite:(id,l=50)=>api.get(`/websites/${id}/events?limit=${l}`) }
export const notificationAPI = { getUnreadCount:()=>api.get('/notifications/unread-count'), markAllRead:()=>api.post('/notifications/mark-all-read') }
export const userAdminAPI    = { create:d=>api.post('/users/create',d), delete:id=>api.delete(`/users/${id}`) }
