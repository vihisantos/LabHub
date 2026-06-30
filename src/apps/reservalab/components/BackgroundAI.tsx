import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

export function BackgroundAI() {
  const isMobile = useIsMobile()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [bgLoaded, setBgLoaded] = useState(false)

  useEffect(() => {
    if (isMobile) return
    const img = new Image()
    img.onload = () => setBgLoaded(true)
    img.src = '/bg_science.png'
  }, [isMobile])

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
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const gridSize = 60
      ctx.lineWidth = 0.4

      for (let x = 0; x <= canvas.width; x += gridSize) {
        const alpha = 0.07 + Math.sin(time + x * 0.01) * 0.03
        ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        const alpha = 0.07 + Math.sin(time + y * 0.01) * 0.03
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      const scanY = ((time * 60) % (canvas.height + 200)) - 100
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30)
      scanGrad.addColorStop(0, 'rgba(16, 185, 129, 0)')
      scanGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.06)')
      scanGrad.addColorStop(1, 'rgba(16, 185, 129, 0)')
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

  if (isMobile) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      pointerEvents: 'none',
      backgroundColor: '#060c18',
      backgroundImage: bgLoaded ? 'url(/bg_science.png)' : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }}>
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
    </div>
  )
}
