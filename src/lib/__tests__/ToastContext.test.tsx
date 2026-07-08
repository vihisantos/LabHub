import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, renderHook } from '@testing-library/react'
import { ToastProvider, useToast } from '../ToastContext'

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renderiza children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Content</div>
      </ToastProvider>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('Content')
  })

  it('addToast adiciona um toast à lista', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    act(() => {
      result.current.addToast('success', 'Sucesso!')
    })
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Sucesso!')
    expect(result.current.toasts[0].type).toBe('success')
  })

  it('addToast com tipo error NÃO remove automaticamente (duration 0)', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    act(() => {
      result.current.addToast('error', 'Erro!')
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.toasts).toHaveLength(1)
  })

  it('addToast com duration > 0 remove automaticamente após o tempo', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    act(() => {
      result.current.addToast('info', 'Info!', { duration: 5000 })
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(4999) })
    expect(result.current.toasts).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('addToast retorna o id do toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    let id: string = ''
    act(() => {
      id = result.current.addToast('info', 'test')
    })
    expect(id).toBeDefined()
    expect(id.length).toBeGreaterThan(0)
  })

  it('removeToast remove um toast específico', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    let toastId: string = ''
    act(() => {
      toastId = result.current.addToast('info', 'remove-me')
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => {
      result.current.removeToast(toastId)
    })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('removeToast cancela o timer de auto-remove', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    let toastId: string = ''
    act(() => {
      toastId = result.current.addToast('info', 'auto-cancel', { duration: 5000 })
    })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => {
      result.current.removeToast(toastId)
    })
    act(() => { vi.advanceTimersByTime(4000) })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('addToast com action armazena a action', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    act(() => {
      result.current.addToast('info', 'Ação!', {
        action: { label: 'Undo', onClick: () => {} },
      })
    })
    expect(result.current.toasts[0].action).toBeDefined()
    expect(result.current.toasts[0].action!.label).toBe('Undo')
  })

  it('toasts com tipo success são removidos após duration padrão (3s)', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    act(() => {
      result.current.addToast('success', 'Sucesso!')
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('addToast gera id único para cada toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    let id1 = ''
    let id2 = ''
    act(() => {
      id1 = result.current.addToast('info', 'first')
      id2 = result.current.addToast('info', 'second')
    })
    expect(id1).not.toBe(id2)
    expect(result.current.toasts).toHaveLength(2)
  })

  it('useToast retorna o contexto padrão fora do provider', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toasts).toEqual([])
    expect(typeof result.current.addToast).toBe('function')
    expect(typeof result.current.removeToast).toBe('function')
  })
})
