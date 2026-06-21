import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { WS_URL } from '../services/api'

const WebSocketContext = createContext(null)

export function WebSocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)
  const listenersRef = useRef(new Set())
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (import.meta.env.DEV) console.log('[Global WS] Connected')
      setIsConnected(true)
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        listenersRef.current.forEach(listener => listener(msg))
      } catch (e) {
        console.error('[Global WS] Parse error:', e)
      }
    }

    ws.onerror = (err) => {
      console.error('[Global WS] Error:', err)
    }

    ws.onclose = () => {
      if (import.meta.env.DEV) console.log('[Global WS] Disconnected, reconnecting in 3s...')
      setIsConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        // Menutup socket yang masih CONNECTING memicu warning
        // "WebSocket is closed before the connection is established".
        // Tunda penutupan sampai koneksi terbuka agar console tetap bersih.
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.addEventListener('open', () => ws.close(), { once: true })
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }
  }, [connect])

  const subscribe = useCallback((callback) => {
    listenersRef.current.add(callback)
    return () => listenersRef.current.delete(callback)
  }, [])

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useGlobalWebSocket(onMessage) {
  const { subscribe } = useContext(WebSocketContext)
  const onMessageRef = useRef(onMessage)
  
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    const callback = (msg) => onMessageRef.current?.(msg)
    return subscribe(callback)
  }, [subscribe])
}

// Read-only access to the live WebSocket connection state (true once the socket is
// actually OPEN). Use this to drive "LIVE/CONNECTING" indicators instead of waiting
// for the first data message to arrive (which can lag many seconds after a refresh).
export function useWebSocketStatus() {
  const ctx = useContext(WebSocketContext)
  return ctx ? ctx.isConnected : false
}
