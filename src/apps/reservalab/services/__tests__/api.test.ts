import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchReservas, fetchHealth } from '../api'

const mockReservasResponse = {
  lab1_reservas: [
    { horario: '07h30 às 09h20', responsavel: 'João', observacao: 'Aula', reserva_feita_por: 'Maria', alunos: 20, labs: ['LAB01'], lab: 'LAB01', data: '25/06/2026' },
  ],
  lab2_reservas: [],
  reservas_semana: [],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('fetchReservas', () => {
  it('retorna dados de reservas quando fetch é bem-sucedido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockReservasResponse,
    } as Response)

    const result = await fetchReservas()
    expect(result).toEqual(mockReservasResponse)
    expect(fetch).toHaveBeenCalledWith('/api/reservas', expect.any(Object))
  })

  it('usa API_BASE quando VITE_RESERVALAB_API_URL está definido', async () => {
    vi.stubEnv('VITE_RESERVALAB_API_URL', 'https://api.exemplo.com')
    vi.resetModules()

    const { fetchReservas: fetchReservasComBase } = await import('../api')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockReservasResponse,
    } as Response)

    await fetchReservasComBase()
    expect(fetch).toHaveBeenCalledWith('https://api.exemplo.com/api/reservas', expect.any(Object))
  })

  it('lança erro quando fetch retorna status não-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await expect(fetchReservas()).rejects.toThrow('API error: 500')
  })

  it('lança erro quando fetch rejeita', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    await expect(fetchReservas()).rejects.toThrow('Network error')
  })
})

describe('fetchHealth', () => {
  it('retorna status de health quando fetch é bem-sucedido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response)

    const result = await fetchHealth()
    expect(result).toEqual({ status: 'ok' })
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.any(Object))
  })

  it('lança erro quando fetch retorna status não-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    await expect(fetchHealth()).rejects.toThrow('API error: 503')
  })
})
