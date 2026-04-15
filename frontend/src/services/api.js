import axios from 'axios'

const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  return `http://${window.location.hostname}:8080`
}
const BASE_URL = getBaseURL()

const api = axios.create({ baseURL: BASE_URL, headers: { 'Content-Type': 'application/json' } })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    if (!err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token'); localStorage.removeItem('user')
      window.dispatchEvent(new CustomEvent('auth:logout'))
    }
  }
  return Promise.reject(err)
})

export const authAPI    = { login: (d, c)=>api.post('/auth/login', d, c), register: (d, c)=>api.post('/auth/register', d, c) }
export const websiteAPI = { 
  getAll: (c)=>api.get('/websites', c), 
  create: (d, c)=>api.post('/websites', d, c), 
  update: (id, d, c)=>api.put(`/websites/${id}`, d, c), 
  delete: (id, c)=>api.delete(`/websites/${id}`, c), 
  getLogs: (id, l=100, c)=>api.get(`/websites/${id}/logs?limit=${l}`, c) 
}
export const dashboardAPI = { getSummary: (c)=>api.get('/dashboard/summary', c) }
export const userAPI    = { getAll: (c)=>api.get('/users', c), promote: (id, c)=>api.post('/users/promote', {user_id:id}, c), demote: (id, c)=>api.post('/users/demote', {user_id:id}, c) }
export const WS_URL     = `ws://${window.location.hostname}:8080/ws`
export default api
export const historyAPI = {
  getStatusHistory: (range='24h', start='', end='', c) => {
    if (range==='custom'&&start&&end) return api.get(`/dashboard/history?range=custom&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, c)
    return api.get(`/dashboard/history?range=${range}`, c)
  },
}
export const eventsAPI       = { getAll: (l=100, c)=>api.get(`/dashboard/events?limit=${l}`, c), getByWebsite: (id, l=50, c)=>api.get(`/websites/${id}/events?limit=${l}`, c) }
export const notificationAPI = { getUnreadCount: (c)=>api.get('/notifications/unread-count', c), markAllRead: (c)=>api.post('/notifications/mark-all-read', {}, c) }
export const userAdminAPI    = { create: (d, c)=>api.post('/users/create', d, c), delete: (id, c)=>api.delete(`/users/${id}`, c) }
