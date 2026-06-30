import { useIsMobile } from '../hooks/useIsMobile'

const SVGStyles = {
  width: '100%' as const,
  height: '100%' as const,
  position: 'fixed' as const,
  top: 0,
  left: 0,
  zIndex: -1,
  pointerEvents: 'none' as const,
  opacity: 0.15,
}

export function BackgroundAI() {
  const isMobile = useIsMobile()

  if (isMobile) return null

  return (
    <canvas
      id="bg-canvas"
      style={{
        ...SVGStyles,
        opacity: 0.08,
      }}
    />
  )
}
