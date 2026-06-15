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
      console.log('[Global WS] Connected')
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
      console.log('[Global WS] Disconnected, reconnecting in 3s...')
      setIsConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onerror = null
        wsRef.current.onclose = null
        wsRef.current.close()
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
