import { useEffect, useRef } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

export function BackgroundAI() {
  const isMobile = useIsMobile()
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    const nodes = Array.from({ length: 28 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 2 + 1,
      pulse: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      time += 0.008
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Semi-transparent dark overlay so the image shows through
      const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      bg.addColorStop(0, 'rgba(6, 12, 24, 0.55)')
      bg.addColorStop(0.5, 'rgba(8, 15, 32, 0.5)')
      bg.addColorStop(1, 'rgba(5, 11, 21, 0.6)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)

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

      nodes.forEach(node => {
        node.x += node.vx
        node.y += node.vy
        node.pulse += 0.02
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1
      })

      const maxDist = 160
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.25
            const isBlue = (i + j) % 2 === 0
            ctx.strokeStyle = isBlue
              ? `rgba(59, 130, 246, ${alpha})`
              : `rgba(16, 185, 129, ${alpha})`
            ctx.lineWidth = (1 - dist / maxDist) * 1.2
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      nodes.forEach((node, i) => {
        const pulseScale = 1 + Math.sin(node.pulse) * 0.4
        const isBlue = i % 2 === 0
        const color = isBlue ? '59, 130, 246' : '16, 185, 129'

        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 6 * pulseScale)
        glow.addColorStop(0, `rgba(${color}, 0.3)`)
        glow.addColorStop(1, `rgba(${color}, 0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius * 6 * pulseScale, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `rgba(${color}, 0.9)`
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fill()
      })

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
      backgroundImage: 'url(/bg_science.png)',
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
