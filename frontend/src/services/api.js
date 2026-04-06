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

export const authAPI    = { login: d=>api.post('/auth/login',d), register: d=>api.post('/auth/register',d) }
export const websiteAPI = { getAll:()=>api.get('/websites'), create:d=>api.post('/websites',d), update:(id,d)=>api.put(`/websites/${id}`,d), delete:id=>api.delete(`/websites/${id}`), getLogs:(id,l=100)=>api.get(`/websites/${id}/logs?limit=${l}`) }
export const dashboardAPI = { getSummary:()=>api.get('/dashboard/summary') }
export const userAPI    = { getAll:()=>api.get('/users'), promote:id=>api.post('/users/promote',{user_id:id}), demote:id=>api.post('/users/demote',{user_id:id}) }
export const WS_URL     = `ws://${window.location.hostname}:8080/ws`
export default api
export const historyAPI = {
  getStatusHistory: (range='24h', start='', end='') => {
    if (range==='custom'&&start&&end) return api.get(`/dashboard/history?range=custom&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
    return api.get(`/dashboard/history?range=${range}`)
  },
}
export const eventsAPI       = { getAll:(l=100)=>api.get(`/dashboard/events?limit=${l}`), getByWebsite:(id,l=50)=>api.get(`/websites/${id}/events?limit=${l}`) }
export const notificationAPI = { getUnreadCount:()=>api.get('/notifications/unread-count'), markAllRead:()=>api.post('/notifications/mark-all-read') }
export const userAdminAPI    = { create:d=>api.post('/users/create',d), delete:id=>api.delete(`/users/${id}`) }
