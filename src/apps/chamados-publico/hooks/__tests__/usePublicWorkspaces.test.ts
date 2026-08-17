import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { usePublicWorkspaces } from '../usePublicWorkspaces'

const mockFetch = vi.fn()

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePublicWorkspaces', () => {
  it('carrega os campus do endpoint público e encerra o loading', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        workspaces: [
          { id: 'ws-a', name: 'Campus A' },
          { id: 'ws-b', name: 'Campus B' },
        ],
      })
    )

    const { result } = renderHook(() => usePublicWorkspaces())
    expect(result.current.loading).toBe(true)
    expect(result.current.workspaces).toEqual([])
    expect(result.current.error).toBe(false)

    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(false)
    expect(result.current.workspaces).toEqual([
      { id: 'ws-a', name: 'Campus A' },
      { id: 'ws-b', name: 'Campus B' },
    ])
    expect(mockFetch).toHaveBeenCalledWith('/api/chamados/workspaces', {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fica com lista vazia e error=true quando a API falha (erro de rede)', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => usePublicWorkspaces())
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(true)
    expect(result.current.workspaces).toEqual([])
  })

  it('fica com lista vazia e error=true quando a API responde erro (ex.: 502)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Erro ao listar campi' }, false))

    const { result } = renderHook(() => usePublicWorkspaces())
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(true)
    expect(result.current.workspaces).toEqual([])
  })

  it('fica com lista vazia e error=true quando o corpo não é JSON válido', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })

    const { result } = renderHook(() => usePublicWorkspaces())
    await act(async () => {})

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(true)
    expect(result.current.workspaces).toEqual([])
  })

  it('reload refaz a busca e limpa o erro após uma falha', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => usePublicWorkspaces())
    await act(async () => {})
    expect(result.current.error).toBe(true)
    expect(result.current.workspaces).toEqual([])

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ workspaces: [{ id: 'ws-a', name: 'Campus A' }] })
    )
    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.error).toBe(false)
    expect(result.current.loading).toBe(false)
    expect(result.current.workspaces).toEqual([{ id: 'ws-a', name: 'Campus A' }])
  })
})
