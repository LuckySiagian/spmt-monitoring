import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext(null)

export const LANGUAGES = {
  id: { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  en: { code: 'en', label: 'English', flag: '🇺🇸' },
  zh: { code: 'zh', label: '中文', flag: '🇨🇳' }
}

export const TRANSLATIONS = {
  id: {
    dashboard: 'Dashboard', websites: 'Websites', activity: 'Aktivitas', users: 'Pengguna', notifications: 'Notifikasi',
    online: 'ONLINE', offline: 'OFFLINE', critical: 'KRITIS', unknown: 'TAK DIKENAL', total: 'TOTAL', alerts: 'PERINGATAN',
    profile: 'Profil', settings: 'Pengaturan', about: 'Tentang', logout: 'Keluar', save: 'Simpan', cancel: 'Batal', delete: 'Hapus',
    edit: 'Ubah', createUser: 'BUAT USER', addWebsite: 'TAMBAH WEBSITE', clearAll: 'Hapus Semua', markAllRead: 'Tandai Dibaca'
  },
  en: {
    dashboard: 'Dashboard', websites: 'Websites', activity: 'Activity', users: 'Users', notifications: 'Notifications',
    online: 'ONLINE', offline: 'OFFLINE', critical: 'CRITICAL', unknown: 'UNKNOWN', total: 'TOTAL', alerts: 'ALERTS',
    profile: 'Profile', settings: 'Settings', about: 'About', logout: 'Logout', save: 'Save', cancel: 'Cancel', delete: 'Delete',
    edit: 'Edit', createUser: 'CREATE USER', addWebsite: 'ADD WEBSITE', clearAll: 'Clear All', markAllRead: 'Mark All Read'
  },
  zh: {
    dashboard: '仪表板', websites: '网站', activity: '活动', users: '用户', notifications: '通知',
    online: '在线', offline: '离线', critical: '严重', unknown: '未知', total: '总计', alerts: '警报',
    profile: '个人资料', settings: '设置', about: '关于', logout: '登出', save: '保存', cancel: '取消', delete: '删除',
    edit: '编辑', createUser: '创建用户', addWebsite: '添加网站', clearAll: '清除全部', markAllRead: '全部已读'
  }
}

export const THEME_OPTIONS = [
  { id: 'theme-dark',   name: 'Enterprise Dark', color: '#6366f1' },
  { id: 'theme-cyber',  name: 'Cyberpunk Red',   color: '#ef4444' },
  { id: 'theme-matrix', name: 'Hacker Green',    color: '#10b981' },
  { id: 'theme-ocean',  name: 'Ocean Blue',      color: '#0ea5e9' },
  { id: 'theme-neon',   name: 'Neon Purple',     color: '#d946ef' },
  { id: 'theme-solar',  name: 'Solarized Dark',  color: '#eab308' },
  { id: 'theme-light',  name: 'Clean Light',     color: '#3b82f6' }
]

export function ThemeProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('spmt_lang') || 'id')
  const [themeId, setThemeId] = useState(() => localStorage.getItem('spmt_theme') || 'theme-dark')

  useEffect(() => {
    // Apply theme class to body
    document.body.className = themeId
  }, [themeId])

  const setLanguage = useCallback((code) => {
    setLang(code)
    localStorage.setItem('spmt_lang', code)
  }, [])

  const setTheme = useCallback((id) => {
    setThemeId(id)
    localStorage.setItem('spmt_theme', id)
  }, [])

  const t = TRANSLATIONS[lang] || TRANSLATIONS.id

  return (
    <ThemeContext.Provider value={{
      lang, setLanguage, t, LANGUAGES,
      themeId, setTheme, THEME_OPTIONS
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
