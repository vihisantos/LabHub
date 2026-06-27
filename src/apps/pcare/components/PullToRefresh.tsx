import { useCallback, useRef, useState, type ReactNode } from 'react'

interface PullToRefreshProps {
  onRefresh: () => void
  children: ReactNode
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [state, setState] = useState<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle')
  const startY = useRef(0)
  const pullDist = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      pullDist.current = 0
      setState('pulling')
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (state === 'idle' || state === 'refreshing') return
    const dist = Math.max(0, e.touches[0].clientY - startY.current)
    pullDist.current = dist
    if (dist > 70) {
      setState('ready')
    } else if (dist > 5) {
      setState('pulling')
    }
  }, [state])

  const handleTouchEnd = useCallback(() => {
    if (state === 'ready') {
      setState('refreshing')
      onRefresh()
      setTimeout(() => setState('idle'), 600)
    } else {
      setState('idle')
    }
  }, [state, onRefresh])

  const dist = Math.min(pullDist.current, 80)
  const rotation = Math.min(dist / 70, 1) * 360

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {state !== 'idle' && (
        <div
          className="flex justify-center overflow-hidden transition-all duration-200"
          style={{ height: state === 'refreshing' ? 40 : dist * 0.5 }}
        >
          <div className="flex items-center gap-2 text-xs text-fg-dim">
            <span
              className="inline-block text-sm transition-transform"
              style={{
                transform: state === 'refreshing' ? 'rotate(360deg)' : `rotate(${rotation}deg)`,
                animation: state === 'refreshing' ? 'none' : undefined,
              }}
            >
              {state === 'refreshing' ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              ) : state === 'ready' ? (
                '↓'
              ) : (
                '↓'
              )}
            </span>
            {state === 'ready' ? 'Solte para atualizar' : state === 'refreshing' ? 'Atualizando...' : 'Puxe para atualizar'}
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
