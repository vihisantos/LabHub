import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSwipeBack } from '../useSwipeBack'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

function createTouchEvent(type: string, clientX: number, clientY: number) {
  return new TouchEvent(type, {
    touches: [{ clientX, clientY } as Touch],
    changedTouches: [{ clientX, clientY } as Touch],
  })
}

function createTouchEndEvent(clientX: number, clientY: number) {
  return new TouchEvent('touchend', {
    changedTouches: [{ clientX, clientY } as Touch],
  })
}

beforeEach(() => {
  mockNavigate.mockClear()
})

describe('useSwipeBack', () => {
  it('navega para trás quando swipa da borda esquerda >80px', () => {
    renderHook(() => useSwipeBack())

    act(() => {
      document.dispatchEvent(createTouchEvent('touchstart', 10, 100))
    })
    act(() => {
      document.dispatchEvent(createTouchEndEvent(100, 105))
    })

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('não navega quando swipa menos de 80px', () => {
    renderHook(() => useSwipeBack())

    act(() => {
      document.dispatchEvent(createTouchEvent('touchstart', 10, 100))
    })
    act(() => {
      document.dispatchEvent(createTouchEndEvent(60, 105))
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('não navega quando começa longe da borda (>30px)', () => {
    renderHook(() => useSwipeBack())

    act(() => {
      document.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    })
    act(() => {
      document.dispatchEvent(createTouchEndEvent(200, 105))
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('não navega quando movimento vertical é grande (>50px)', () => {
    renderHook(() => useSwipeBack())

    act(() => {
      document.dispatchEvent(createTouchEvent('touchstart', 10, 100))
    })
    act(() => {
      document.dispatchEvent(createTouchEndEvent(100, 200))
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('remove event listeners ao desmontar', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useSwipeBack())
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function))
  })
})
