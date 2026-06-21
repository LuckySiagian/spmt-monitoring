import { useState, useEffect } from 'react'

// Centralized, size-based device detection. We classify by viewport width
// (and pointer type) — NOT by brand — so it covers every device automatically:
//   phone   < 640px   (Android / iPhone)
//   tablet  640–1024  (iPad / tablets)
//   desktop > 1024px  (laptop / monitor)
const read = () => {
  if (typeof window === 'undefined') {
    return { width: 1280, isPhone: false, isTablet: false, isDesktop: true, isTouch: false }
  }
  const width = window.innerWidth
  return {
    width,
    isPhone: width < 640,
    isTablet: width >= 640 && width <= 1024,
    isDesktop: width > 1024,
    isTouch: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  }
}

export function useBreakpoint() {
  const [state, setState] = useState(read)

  useEffect(() => {
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setState(read()))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  return state
}
