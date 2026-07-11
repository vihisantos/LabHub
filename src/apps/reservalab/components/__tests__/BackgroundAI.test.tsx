import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { BackgroundAI } from '../BackgroundAI'

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}))

import { useIsMobile } from '../../hooks/useIsMobile'

let rafCallbacks: Map<number, FrameRequestCallback>
let rafId = 0

beforeEach(() => {
  rafCallbacks = new Map()
  rafId = 0

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    fillStyle: '',
    fillRect: vi.fn(),
  })) as any

  window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    const id = ++rafId
    rafCallbacks.set(id, cb)
    return id
  })

  window.cancelAnimationFrame = vi.fn((id: number) => {
    rafCallbacks.delete(id)
  })

  ;(useIsMobile as any).mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BackgroundAI', () => {
  it('renderiza canvas quando não é mobile', () => {
    const { container } = render(<BackgroundAI />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('não renderiza canvas quando é mobile', () => {
    ;(useIsMobile as any).mockReturnValue(true)
    const { container } = render(<BackgroundAI />)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('tem background-color definido', () => {
    const { container } = render(<BackgroundAI />)
    const div = container.firstChild as HTMLElement
    expect(div.style.backgroundColor).toBeTruthy()
  })
})
