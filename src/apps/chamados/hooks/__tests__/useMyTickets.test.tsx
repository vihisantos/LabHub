import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockListMine = vi.hoisted(() => vi.fn())

vi.mock('../../services/ticketService', () => ({
  ticketService: { listMine: mockListMine },
}))

import { useMyTickets } from '../useMyTickets'

// `src/test/setup.ts` liga timers falsos globalmente, então o flush é feito com
// `act` — o mesmo padrão do resto da suíte (waitFor ficaria esperando timers).
async function flush() {
  await act(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMyTickets — conjunto autorizado pelo servidor', () => {
  it('desativado: não chama a API e não devolve nada', async () => {
    const { result } = renderHook(() => useMyTickets(false))
    await flush()

    expect(mockListMine).not.toHaveBeenCalled()
    expect(result.current.tickets).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('ativado: busca uma vez e expõe o que o servidor devolveu', async () => {
    mockListMine.mockResolvedValue([{ id: 'meu-1' }, { id: 'meu-2' }])

    const { result } = renderHook(() => useMyTickets(true))
    await flush()

    expect(mockListMine).toHaveBeenCalledTimes(1)
    expect(result.current.tickets.map((t) => t.id)).toEqual(['meu-1', 'meu-2'])
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('erro: esvazia e expõe a mensagem — NUNCA cai para a fila', async () => {
    mockListMine.mockRejectedValue(new Error('Sem conexão'))

    const { result } = renderHook(() => useMyTickets(true))
    await flush()

    expect(result.current.tickets).toEqual([])
    expect(result.current.error).toBe('Sem conexão')
    expect(result.current.loading).toBe(false)
  })

  it('erro sem Error: ainda expõe uma mensagem legível', async () => {
    mockListMine.mockRejectedValue('boom')

    const { result } = renderHook(() => useMyTickets(true))
    await flush()

    expect(result.current.error).toBeTruthy()
  })

  it('reload refaz a consulta', async () => {
    mockListMine.mockResolvedValue([{ id: 'meu-1' }])

    const { result } = renderHook(() => useMyTickets(true))
    await flush()
    expect(mockListMine).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.reload()
    })

    expect(mockListMine).toHaveBeenCalledTimes(2)
  })

  it('desligar limpa o estado (não deixa chamado de outro escopo na tela)', async () => {
    mockListMine.mockResolvedValue([{ id: 'meu-1' }])

    const { result, rerender } = renderHook(({ on }) => useMyTickets(on), {
      initialProps: { on: true },
    })
    await flush()
    expect(result.current.tickets).toHaveLength(1)

    await act(async () => {
      rerender({ on: false })
    })

    expect(result.current.tickets).toEqual([])
  })

  it('se o servidor devolve [], o estado é [] — não há fonte alternativa', async () => {
    mockListMine.mockResolvedValue([])

    const { result } = renderHook(() => useMyTickets(true))
    await flush()

    expect(result.current.tickets).toEqual([])
    expect(result.current.error).toBeNull()
  })
})