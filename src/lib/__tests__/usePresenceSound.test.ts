import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePresenceSound, __resetAudioContext } from '../usePresenceSound'

let audioCtxInstanceCount = 0

beforeEach(() => {
  /* Reset module-level singleton so each test starts fresh */
  __resetAudioContext()

  audioCtxInstanceCount = 0

  const mockCtx = {
    createOscillator: vi.fn(),
    createGain: vi.fn(),
    destination: {} as any,
    currentTime: 0,
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  }

  function MockAudioContext() {
    audioCtxInstanceCount++
    return mockCtx
  }
  globalThis.AudioContext = MockAudioContext as any

  localStorage.clear()
})

afterEach(() => {
  delete (globalThis as any).AudioContext
})

describe('usePresenceSound', () => {
  it('cria AudioContext apenas na primeira vez que playBeep é chamada (lazy init)', () => {
    const { result } = renderHook(() => usePresenceSound())
    expect(audioCtxInstanceCount).toBe(0)

    act(() => { result.current.playBeep('join') })

    expect(audioCtxInstanceCount).toBe(1)
  })

  it('reusa o singleton AudioContext em chamadas consecutivas do playBeep', () => {
    const { result } = renderHook(() => usePresenceSound())

    act(() => { result.current.playBeep('join') })
    expect(audioCtxInstanceCount).toBe(1)

    // Segunda chamada deve reutilizar o mesmo AudioContext (singleton)
    act(() => { result.current.playBeep('leave') })
    expect(audioCtxInstanceCount).toBe(1)
  })

  it('não toca beep quando muted é true', () => {
    const { result } = renderHook(() => usePresenceSound())

    act(() => { result.current.toggleMute() })
    expect(result.current.muted).toBe(true)

    act(() => { result.current.playBeep('join') })

    expect(audioCtxInstanceCount).toBe(0)
  })

  it('persiste muted no localStorage', () => {
    const { result } = renderHook(() => usePresenceSound())

    expect(localStorage.getItem('labhub_presence_muted')).toBeNull()
    expect(result.current.muted).toBe(false)

    act(() => { result.current.toggleMute() })
    expect(result.current.muted).toBe(true)
    expect(localStorage.getItem('labhub_presence_muted')).toBe('true')

    act(() => { result.current.toggleMute() })
    expect(result.current.muted).toBe(false)
    expect(localStorage.getItem('labhub_presence_muted')).toBe('false')
  })

  it('lê o muted do localStorage como estado inicial', () => {
    localStorage.setItem('labhub_presence_muted', 'true')

    const { result } = renderHook(() => usePresenceSound())
    expect(result.current.muted).toBe(true)
  })

  it('não quebra quando AudioContext não está disponível', () => {
    delete (globalThis as any).AudioContext

    const { result } = renderHook(() => usePresenceSound())

    expect(() => {
      act(() => { result.current.playBeep('join') })
    }).not.toThrow()
  })

  it('cria AudioContext ao tocar beep', () => {
    const { result } = renderHook(() => usePresenceSound())

    act(() => { result.current.playBeep('join') })

    expect(audioCtxInstanceCount).toBe(1)
  })

  it('toggleMute é uma referência estável (mesma função entre renders)', () => {
    const { result, rerender } = renderHook(() => usePresenceSound())

    const firstToggle = result.current.toggleMute
    rerender()
    expect(result.current.toggleMute).toBe(firstToggle)
  })
})
