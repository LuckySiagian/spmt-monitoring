import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext(null)

export const LANGUAGES = {
  id: { code: 'id', label: 'Indo', flag: '🇮🇩' },
  en: { code: 'en', label: 'Eng',  flag: '🇺🇸' },
  zh: { code: 'zh', label: '中文',  flag: '🇨🇳' },
  ja: { code: 'ja', label: '日本語', flag: '🇯🇵' },
  ru: { code: 'ru', label: 'Рус',  flag: '🇷🇺' }
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
  },
  ja: {
    dashboard: 'ダッシュボード', websites: 'ウェブサイト', activity: 'アクティビティ', users: 'ユーザー', notifications: '通知',
    online: 'オンライン', offline: 'オフライン', critical: 'クリティカル', unknown: '不明', total: '合計', alerts: 'アラート',
    profile: 'プロファイル', settings: '設定', about: '詳細', logout: 'ログアウト', save: '保存', cancel: 'キャンセル', delete: '削除',
    edit: '編集', createUser: 'ユーザー作成', addWebsite: 'サイト追加', clearAll: 'すべて消去', markAllRead: 'すべて既読'
  },
  ru: {
    dashboard: 'Панель', websites: 'Сайты', activity: 'Активность', users: 'Пользователи', notifications: 'Уведомления',
    online: 'ОНЛАЙН', offline: 'ОФФЛАЙН', critical: 'КРИТИЧЕСКИЙ', unknown: 'НЕИЗВЕСТНО', total: 'ВСЕГО', alerts: 'ТРЕВОГИ',
    profile: 'Профиль', settings: 'Настройки', about: 'О программе', logout: 'Выйти', save: 'Сохранить', cancel: 'Отмена', delete: 'Удалить',
    edit: 'Правка', createUser: 'СОЗДАТЬ ЮЗЕРА', addWebsite: 'ДОБАВИТЬ САЙТ', clearAll: 'Очистить все', markAllRead: 'Прочитать все'
  }
}

export const THEME_OPTIONS = [
  { id: 'theme-light', name: 'Clean Light', color: '#3b82f6', dark: false },
  { id: 'theme-light-sky', name: 'Sky Blue', color: '#0284c7', dark: false },
  { id: 'theme-light-emerald', name: 'Emerald', color: '#059669', dark: false },
  { id: 'theme-light-lavender', name: 'Lavender', color: '#7c3aed', dark: false },
  { id: 'theme-light-rose', name: 'Rose', color: '#e11d48', dark: false },
  { id: 'theme-light-amber', name: 'Amber', color: '#d97706', dark: false },
  { id: 'theme-light-slate', name: 'Slate', color: '#475569', dark: false },
  { id: 'theme-light-teal', name: 'Teal', color: '#0d9488', dark: false },
  { id: 'theme-light-indigo', name: 'Indigo', color: '#4f46e5', dark: false },
  { id: 'theme-light-orange', name: 'Orange', color: '#ea580c', dark: false },
  
  { id: 'theme-dark', name: 'Enterprise Dark', color: '#6366f1', dark: true },
  { id: 'theme-dark-obsidian', name: 'Obsidian', color: '#38bdf8', dark: true },
  { id: 'theme-dark-forest', name: 'Forest', color: '#34d399', dark: true },
  { id: 'theme-dark-midnight', name: 'Midnight', color: '#818cf8', dark: true },
  { id: 'theme-dark-crimson', name: 'Crimson', color: '#f87171', dark: true },
  { id: 'theme-dark-violet', name: 'Violet', color: '#a78bfa', dark: true },
  { id: 'theme-dark-carbon', name: 'Carbon', color: '#a3a3a3', dark: true },
  { id: 'theme-dark-ocean', name: 'Ocean Depth', color: '#7dd3fc', dark: true },
  { id: 'theme-dark-plum', name: 'Deep Plum', color: '#f472b6', dark: true },
  { id: 'theme-dark-neon-glow', name: 'Neon Glow', color: '#00ff41', dark: true }
]

export function ThemeProvider({ children }) {
  const [lang] = useState('en')
  const [themeId, setThemeId] = useState(() => localStorage.getItem('spmt_theme') || 'theme-light')

  useEffect(() => {
    document.documentElement.className = themeId
    const isDark = THEME_OPTIONS.find(t => t.id === themeId)?.dark
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [themeId])

  const setTheme = useCallback((id) => {
    setThemeId(id)
    localStorage.setItem('spmt_theme', id)
  }, [])

  const t = TRANSLATIONS.en

  return (
    <ThemeContext.Provider value={{
      lang, t, LANGUAGES,
      themeId, setTheme, THEME_OPTIONS
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
