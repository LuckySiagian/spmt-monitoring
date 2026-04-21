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
  { id: 'theme-crystal-cyan', name: 'Crystal Cyan', color: '#00d1b2', dark: false },
  { id: 'theme-emerald-mint', name: 'Emerald Mint', color: '#00b894', dark: false },
  { id: 'theme-solar-amber', name: 'Solar Amber', color: '#f39c12', dark: false },
  { id: 'theme-electric-sky', name: 'Electric Sky', color: '#3498db', dark: false },
  { id: 'theme-plasma-pink', name: 'Plasma Pink', color: '#e056fd', dark: false },
  { id: 'theme-obsidian-soft', name: 'Soft Obsidian', color: '#2d3436', dark: false },
]

export function ThemeProvider({ children }) {
  const [lang] = useState('en')
  const [themeId, setThemeId] = useState(() => localStorage.getItem('spmt_theme') || 'theme-light')

  useEffect(() => {
    document.documentElement.className = themeId
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
