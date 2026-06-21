import { useEffect, useRef } from 'react'

/**
 * Background video full-screen dengan loop yang mulus (seamless).
 *
 * Karena klip video hanya satu dan diputar berulang, titik sambung loop biasanya
 * terlihat "patah". Komponen ini memakai dua elemen <video> yang di-crossfade:
 * saat video aktif hampir habis, video kedua mulai dari awal sambil opacity-nya
 * dinaikkan perlahan — sehingga pengulangannya terasa halus.
 *
 * Catatan performa: ini file statis (tidak membebani server backend). Beban dekode
 * ada di browser; crossfade hanya mengaktifkan dekoder kedua sesaat di titik sambung.
 *
 * props:
 *  - src: path video (mis. "/images/background/login-bg.mp4")
 *  - poster: gambar tampil instan sebelum video siap (mis. SVG komposit)
 *  - fade: durasi crossfade dalam detik (default 0.8)
 *  - objectPosition: fokus framing video, mis. "center" / "center 65%"
 *  - style / className: diteruskan ke wrapper
 */
export default function VideoBackground({
  src,
  poster,
  fade = 0.8,
  objectPosition = 'center',
  style,
  className,
}) {
  const aRef = useRef(null)
  const bRef = useRef(null)
  const activeRef = useRef('a')

  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b) return

    a.style.opacity = '1'
    b.style.opacity = '0'
    activeRef.current = 'a'

    const playSafe = (v) => {
      const p = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
    playSafe(a)

    // Jika autoplay diblokir browser, mulai saat ada interaksi pertama.
    const kick = () => playSafe(activeRef.current === 'a' ? a : b)
    window.addEventListener('pointerdown', kick, { once: true })

    let raf
    const tick = () => {
      const cur = activeRef.current === 'a' ? a : b
      const nxt = activeRef.current === 'a' ? b : a
      const dur = cur.duration

      if (dur && !Number.isNaN(dur) && Number.isFinite(dur)) {
        const remaining = dur - cur.currentTime

        if (remaining <= fade) {
          // Pastikan video berikutnya sudah jalan dari awal.
          if (nxt.paused) {
            try { nxt.currentTime = 0 } catch (_) {}
            playSafe(nxt)
          }
          const t = Math.max(0, Math.min(1, (fade - remaining) / fade))
          cur.style.opacity = String(1 - t)
          nxt.style.opacity = String(t)

          // Selesai crossfade: tukar peran, jeda video lama agar siap dipakai lagi.
          if (remaining <= 0.04) {
            cur.style.opacity = '0'
            nxt.style.opacity = '1'
            cur.pause()
            try { cur.currentTime = 0 } catch (_) {}
            activeRef.current = activeRef.current === 'a' ? 'b' : 'a'
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointerdown', kick)
    }
  }, [src, fade])

  const videoStyle = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
    pointerEvents: 'none',
  }

  return (
    <div
      className={className}
      style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', ...style }}
      aria-hidden="true"
    >
      <video
        ref={aRef}
        src={src}
        poster={poster}
        muted
        autoPlay
        playsInline
        preload="auto"
        style={{ ...videoStyle, opacity: 1 }}
      />
      <video
        ref={bRef}
        src={src}
        muted
        playsInline
        preload="auto"
        style={{ ...videoStyle, opacity: 0 }}
      />
    </div>
  )
}
