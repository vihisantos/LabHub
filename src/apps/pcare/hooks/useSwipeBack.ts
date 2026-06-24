import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export function useSwipeBack() {
  const navigate = useNavigate()
  const startX = useRef(0)
  const startY = useRef(0)
  const swiping = useRef(false)

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0]
      if (touch.clientX <= 30) {
        startX.current = touch.clientX
        startY.current = touch.clientY
        swiping.current = true
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!swiping.current) return
      swiping.current = false
      const touch = e.changedTouches[0]
      const dx = touch.clientX - startX.current
      const dy = Math.abs(touch.clientY - startY.current)
      if (dx > 80 && dy < 50) {
        navigate(-1)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [navigate])
}
