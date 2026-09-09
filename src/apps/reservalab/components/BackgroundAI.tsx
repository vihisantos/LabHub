import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { themeStore } from '../../../core/theme/store'

/** Reads the current --accent hex from CSS and returns "r, g, b" (for rgba()). */
function getAccentRgb(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(raw)
  if (!m) return '16, 185, 129' // fallback emerald
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

export function BackgroundAI() {
  const isMobile = useIsMobile()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [theme, setTheme] = useState(themeStore.getState().theme)
  const accentRgbRef = useRef(getAccentRgb())

  // Tema do app principal manda: acompanha dark/dim/light + accent
  useEffect(() => themeStore.subscribe((s) => {
    setTheme(s.theme)
    accentRgbRef.current = getAccentRgb()
  }), [])

  useEffect(() => {
    const img = new Image()
    img.onload = () => setBgLoaded(true)
    img.src = '/bg_science.png'
  }, [])

  useEffect(() => {
    if (isMobile) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    let animFrame: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      time += 0.008
      const accent = accentRgbRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const gridSize = 60
      ctx.lineWidth = 0.4

      for (let x = 0; x <= canvas.width; x += gridSize) {
        const alpha = 0.07 + Math.sin(time + x * 0.01) * 0.03
        ctx.strokeStyle = `rgba(${accent}, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        const alpha = 0.07 + Math.sin(time + y * 0.01) * 0.03
        ctx.strokeStyle = `rgba(${accent}, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      const scanY = ((time * 60) % (canvas.height + 200)) - 100
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30)
      scanGrad.addColorStop(0, `rgba(${accent}, 0)`)
      scanGrad.addColorStop(0.5, `rgba(${accent}, 0.06)`)
      scanGrad.addColorStop(1, `rgba(${accent}, 0)`)
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 30, canvas.width, 60)

      animFrame = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resize)
    }
  }, [isMobile])

  // No dark/dim a imagem vira textura sutil sobre o fundo do tema;
  // no light mantém a aparência original.
  const imgOpacity = theme === 'light' ? 1 : 0.14

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      pointerEvents: 'none',
      backgroundColor: 'var(--bg-primary)',
      transition: 'background-color 0.3s ease',
    }}>
      {bgLoaded && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/bg_science.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          opacity: imgOpacity,
          transition: 'opacity 0.3s ease',
        }} />
      )}
      {!isMobile && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        />
      )}
    </div>
  )
}
