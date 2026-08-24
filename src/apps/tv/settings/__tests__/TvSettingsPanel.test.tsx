import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement } from 'react'

vi.mock('../../../../core/appSettings/service', () => ({
  appSettingsService: {
    getSettings: vi.fn(),
    upsertSettings: vi.fn(),
    getUpdatedAt: vi.fn().mockResolvedValue(null),
    invalidate: vi.fn(),
    clearCache: vi.fn(),
  },
}))

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } }),
  },
}))
vi.mock('../../../../lib/supabase', () => ({ defaultDb: mockSupabase }))

import { TvSettingsPanel } from '../TvSettingsPanel'
import { appSettingsService } from '../../../../core/appSettings/service'
import { tvApi } from '../../utils/apiBase'
import type { TvAppSettings } from '../types'

const getSettings = vi.mocked(appSettingsService.getSettings)
const upsertSettings = vi.mocked(appSettingsService.upsertSettings)

function renderPanel() {
  return render(createElement(TvSettingsPanel, { appId: 'tv' }))
}

function storedSettings(overrides: Partial<TvAppSettings> = {}): TvAppSettings {
  return {
    eventSource: { enabled: false, type: 'sharepoint_excel', url: '', ...overrides.eventSource },
    period: {},
    display: { refreshIntervalSeconds: 300 },
    ...overrides,
  }
}

function fetchWillReturn(ok: boolean, body: Record<string, unknown>, status = ok ? 200 : 502) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('TvSettingsPanel', () => {
  it('mostra skeleton enquanto carrega e depois preenche os campos', async () => {
    getSettings.mockResolvedValueOnce(
      storedSettings({
        eventSource: { enabled: true, type: 'sharepoint_excel', url: 'https://a.com/x.xlsx' },
      }),
    )
    const { container } = renderPanel()
    expect(container.querySelector('[data-testid="tv-panel-loading"]')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByTestId('tv-url-input')).toHaveProperty('value', 'https://a.com/x.xlsx')
    })
    expect(screen.getByTestId('tv-source-toggle')).toHaveProperty('checked', true)
  })

  it('exibe erro quando o carregamento falha', async () => {
    getSettings.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    expect(await screen.findByText('Não foi possível carregar a configuração')).toBeTruthy()
  })

  it('salva via upsertSettings com syncedAt e mostra estado saving', async () => {
    getSettings.mockResolvedValueOnce(storedSettings())
    let resolveUpsert!: (v: TvAppSettings) => void
    upsertSettings.mockImplementationOnce(
      () =>
        new Promise<TvAppSettings>((resolve) => {
          resolveUpsert = resolve
        }),
    )
    renderPanel()
    await screen.findByTestId('tv-save-button')

    fireEvent.click(screen.getByTestId('tv-save-button'))
    expect(screen.getByTestId('tv-save-button').textContent).toBe('Salvando…')
    expect(upsertSettings).toHaveBeenCalledTimes(1)

    const [calledAppId, patch] = upsertSettings.mock.calls[0]
    expect(calledAppId).toBe('tv')
    const candidate = patch as TvAppSettings
    expect(candidate.syncedAt).toBeTruthy()
    expect(candidate.display.refreshIntervalSeconds).toBe(300)

    await waitFor(() =>
      resolveUpsert({ ...(patch as TvAppSettings), syncedAt: '2026-08-24T18:00:00Z' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('tv-save-button').textContent).toBe('Salvar'),
    )
    expect(screen.getByTestId('tv-saved-at').textContent).toContain('24/08/2026')
  })

  it('valida antes de gravar: enabled sem URL não chama upsert e mostra erro', async () => {
    getSettings.mockResolvedValueOnce(storedSettings())
    renderPanel()
    await screen.findByTestId('tv-save-button')

    fireEvent.click(screen.getByTestId('tv-source-toggle'))
    fireEvent.click(screen.getByTestId('tv-save-button'))

    const err = await screen.findByRole('alert')
    expect(err.textContent).toContain('obrigatória')
    expect(upsertSettings).not.toHaveBeenCalled()
  })

  it('Testar fonte agora chama a API com Bearer token e exibe preview com ignorados', async () => {
    getSettings.mockResolvedValueOnce(storedSettings())
    const fetchMock = fetchWillReturn(true, {
      ok: true,
      freshness: 'fresh',
      events: [{ externalId: 'e1', title: 'Festa', date: '2026-09-01', origin: 'sharepoint_excel' }],
      validCount: 12,
      ignoredCount: 2,
      syncedAt: '2026-08-24T15:30:00Z',
      source: 'sharepoint_excel',
    })
    renderPanel()
    await screen.findByTestId('tv-test-button')

    fireEvent.click(screen.getByTestId('tv-test-button'))
    expect(screen.getByTestId('tv-test-button').textContent).toContain('Testando…')

    const preview = await screen.findByTestId('tv-preview')
    expect(preview.textContent).toContain('12 eventos encontrados, 2 ignorados.')
    expect(preview.textContent).toContain(
      new Date('2026-08-24T15:30:00Z').toLocaleString('pt-BR'),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      tvApi('/api/tv/source/fetch'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      }),
    )
  })

  it('fonte indisponível sem cache mostra erro', async () => {
    getSettings.mockResolvedValueOnce(storedSettings())
    fetchWillReturn(false, { ok: false, error: 'Fonte respondeu HTTP 500' }, 502)
    renderPanel()
    await screen.findByTestId('tv-test-button')
    fireEvent.click(screen.getByTestId('tv-test-button'))

    const err = await screen.findByRole('alert')
    expect(err.textContent).toContain('HTTP 500')
  })

  it('cache stale é sinalizado ao usuário', async () => {
    getSettings.mockResolvedValueOnce(storedSettings())
    fetchWillReturn(true, {
      ok: true,
      freshness: 'stale',
      warning: 'Tempo esgotado ao contatar a fonte',
      events: [],
      validCount: 5,
      ignoredCount: 0,
      syncedAt: '2026-08-23T10:00:00Z',
      source: 'sharepoint_excel',
    })
    renderPanel()
    await screen.findByTestId('tv-test-button')
    fireEvent.click(screen.getByTestId('tv-test-button'))

    const preview = await screen.findByTestId('tv-preview')
    expect(preview.textContent).toContain('Não foi possível atualizar. Exibindo última sincronização válida.')
    expect(preview.textContent).toContain('Tempo esgotado')
  })

  it('falha de rede no teste vira mensagem amigável', async () => {
    getSettings.mockResolvedValueOnce(storedSettings())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderPanel()
    await screen.findByTestId('tv-test-button')
    fireEvent.click(screen.getByTestId('tv-test-button'))

    const err = await screen.findByRole('alert')
    expect(err.textContent.toLowerCase()).toContain('offline')
  })
})
