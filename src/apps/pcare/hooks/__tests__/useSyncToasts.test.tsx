import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSyncToasts } from '../useSyncToasts'
import { useOnlineSync } from '../useOnlineSync'

vi.mock('../useOnlineSync', () => ({
  useOnlineSync: vi.fn(),
}))

const mockAddToast = vi.fn(() => 'toast-id')
const mockRemoveToast = vi.fn()

vi.mock('../../../../lib/ToastContext', () => ({
  useToast: () => ({
    toasts: [],
    addToast: mockAddToast,
    removeToast: mockRemoveToast,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  ;(useOnlineSync as any).mockReturnValue({
    syncing: false,
    syncError: null,
    triggerSync: vi.fn(),
  })
})

describe('useSyncToasts', () => {
  it('não chama addToast quando não está sincronizando', () => {
    renderHook(() => useSyncToasts())
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('chama addToast com "Sincronizando..." quando syncing transita de false para true', () => {
    ;(useOnlineSync as any).mockReturnValue({
      syncing: false,
      syncError: null,
      triggerSync: vi.fn(),
    })

    const { rerender } = renderHook(() => useSyncToasts())

    ;(useOnlineSync as any).mockReturnValue({
      syncing: true,
      syncError: null,
      triggerSync: vi.fn(),
    })

    act(() => { rerender() })

    expect(mockAddToast).toHaveBeenCalledWith('info', 'Sincronizando...', { duration: 0 })
  })

  it('chama removeToast + addToast "Dados sincronizados" quando sync termina sem erro', () => {
    ;(useOnlineSync as any).mockReturnValue({
      syncing: false,
      syncError: null,
      triggerSync: vi.fn(),
    })

    const { rerender } = renderHook(() => useSyncToasts())

    // Ativa sync
    ;(useOnlineSync as any).mockReturnValue({
      syncing: true,
      syncError: null,
      triggerSync: vi.fn(),
    })
    act(() => { rerender() })
    expect(mockAddToast).toHaveBeenCalledWith('info', 'Sincronizando...', { duration: 0 })

    // Finaliza sync sem erro
    ;(useOnlineSync as any).mockReturnValue({
      syncing: false,
      syncError: null,
      triggerSync: vi.fn(),
    })
    vi.clearAllMocks()
    act(() => { rerender() })

    expect(mockRemoveToast).toHaveBeenCalledWith('toast-id')
    expect(mockAddToast).toHaveBeenCalledWith('success', 'Dados sincronizados', { duration: 3000 })
  })

  it('chama addToast de erro quando syncError', () => {
    const triggerSync = vi.fn()
    ;(useOnlineSync as any).mockReturnValue({
      syncing: false,
      syncError: 'Erro de conexão',
      triggerSync,
    })

    renderHook(() => useSyncToasts())

    expect(mockAddToast).toHaveBeenCalledWith(
      'error',
      'Erro de conexão',
      expect.objectContaining({ duration: 0, action: expect.objectContaining({ label: 'Tentar novamente' }) }),
    )

    // Verificar que a action de retry chama triggerSync
    const callArgs = mockAddToast.mock.calls[0] as any[]
    const action = callArgs[2].action
    action.onClick()
    expect(triggerSync).toHaveBeenCalledOnce()
  })

  it('remove toast de sincronizando quando sync termina com erro', () => {
    ;(useOnlineSync as any).mockReturnValue({
      syncing: false,
      syncError: null,
      triggerSync: vi.fn(),
    })

    const { rerender } = renderHook(() => useSyncToasts())

    // Ativa sync
    ;(useOnlineSync as any).mockReturnValue({
      syncing: true,
      syncError: null,
      triggerSync: vi.fn(),
    })
    act(() => { rerender() })
    expect(mockAddToast).toHaveBeenCalledWith('info', 'Sincronizando...', { duration: 0 })

    // Finaliza sync com erro
    ;(useOnlineSync as any).mockReturnValue({
      syncing: false,
      syncError: 'Timeout',
      triggerSync: vi.fn(),
    })
    vi.clearAllMocks()
    act(() => { rerender() })

    expect(mockRemoveToast).toHaveBeenCalledWith('toast-id')
    expect(mockAddToast).toHaveBeenCalledWith(
      'error',
      'Timeout',
      expect.objectContaining({ duration: 0 }),
    )
  })
})
