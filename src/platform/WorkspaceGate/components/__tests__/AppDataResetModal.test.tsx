import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } }),
  },
}))
vi.mock('../../../../lib/supabase', () => ({ defaultDb: mockSupabase }))
vi.mock('../../../../apps/tv/utils/apiBase', () => ({
  tvApi: (path: string) => `https://api.test${path}`,
}))

import { appRegistry } from '../../../../appRegistry'
import type { Workspace } from '../../../../core/workspaces/types'
import { AppDataResetModal, shortBackupId } from '../AppDataResetModal'
import { renderWithProviders } from '../../../../test/helpers'

const tv = appRegistry.find((a) => a.id === 'tv')!

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: 'Campus A',
    slug: 'campus-a',
    location: 'São Paulo',
    spreadsheet_url: '',
    color: '',
    disabled_apps: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const FULL_TABLES = {
  tv_events: 42,
  tv_playlists: 3,
  tv_announcements: 8,
  tv_galleries: 4,
  tv_gallery_photos: 27,
  tv_music_queues: 2,
  tv_music_tracks: 18,
  tv_urgent_announcements: 1,
  tv_calendar_cache: 1,
}

function describeBody(tables = FULL_TABLES) {
  return {
    ok: true,
    appId: 'tv',
    workspaceId: 'ws-1',
    tables,
    total: Object.values(tables).reduce<number>((a, b) => a + b, 0),
  }
}

const PURGE_OK_BODY = {
  ok: true,
  appId: 'tv',
  backupId: 'b0ac0ffe-1111-2222-3333-444455556666',
  backupExpiresAt: '2026-08-26T12:00:00Z',
  deleted: {
    tv_gallery_photos: 27,
    tv_music_tracks: 18,
    tv_events: 42,
    tv_playlists: 3,
    tv_announcements: 8,
    tv_music_queues: 2,
    tv_galleries: 4,
    tv_calendar_cache: 1,
    tv_urgent_announcements: 1,
  },
  totalDeleted: 106,
}

interface Route {
  url: string
  body: unknown
  status?: number
  hang?: boolean
}

/** Intercepta fetch por substring de URL; a ÚLTIMA rota que casar vence. */
function stubFetch(routes: Route[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
    const urlStr = String(url)
    calls.push({ url: urlStr, init })
    for (const route of [...routes].reverse()) {
      if (!urlStr.includes(route.url)) continue
      if (route.hang) return new Promise<Response>(() => {})
      return Promise.resolve(
        new Response(JSON.stringify(route.body), { status: route.status ?? 200 }),
      )
    }
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

const DESCRIBE_URL_PART = '/api/admin/app-data/describe'
const PURGE_URL_PART = '/api/admin/app-data/purge'

function happyFetch(overrides: Partial<{ purge: Route }> = {}) {
  return stubFetch([
    { url: DESCRIBE_URL_PART, body: describeBody() },
    overrides.purge ?? { url: PURGE_URL_PART, body: PURGE_OK_BODY },
  ])
}

/** Fluxo até o estado de confirmação com contagens visíveis. */
async function openReadyAndStartConfirm(fetchSetup = happyFetch) {
  const ctx = fetchSetup()
  renderWithProviders(
    <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
  )
  await screen.findByTestId('reset-tables-list')
  fireEvent.click(screen.getByTestId('reset-start-button'))
  await screen.findByTestId('reset-confirm-section')
  return ctx
}

describe('AppDataResetModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('abre buscando contagens reais do servidor (loading → lista)', async () => {
    const { calls } = happyFetch()
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
    )

    expect(screen.getByTestId('reset-loading')).toBeTruthy()
    await screen.findByTestId('reset-tables-list')

    const describeCall = calls.find((c) => c.url.includes(DESCRIBE_URL_PART))!
    expect(describeCall).toBeTruthy()
    expect(JSON.parse(String(describeCall.init?.body))).toEqual({
      appId: 'tv',
      workspace_id: 'ws-1',
    })
    expect(mockSupabase.auth.getSession).toHaveBeenCalled()
  })

  it('exibe contagens por tabela e total vindo do backend', async () => {
    happyFetch()
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
    )

    await screen.findByTestId('reset-total')
    expect(screen.getByTestId('count-tv_events').textContent).toBe('42')
    expect(screen.getByTestId('count-tv_playlists').textContent).toBe('3')
    expect(screen.getByTestId('count-tv_gallery_photos').textContent).toBe('27')
    expect(screen.queryByTestId('count-tv_music_requests')).toBeNull()
    expect(screen.getByTestId('reset-total').textContent).toBe('106')
  })

  it('workspace sem dados mostra empty state e nenhuma ação destrutiva', async () => {
    const zeroTables = Object.fromEntries(Object.keys(FULL_TABLES).map((t) => [t, 0]))
    stubFetch([{ url: DESCRIBE_URL_PART, body: describeBody(zeroTables as typeof FULL_TABLES) }])
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
    )

    await screen.findByTestId('reset-empty-state')
    expect(screen.getByText('Não há dados de conteúdo para limpar.')).toBeTruthy()
    expect(screen.queryByTestId('reset-start-button')).toBeNull()
    expect((screen.getByTestId('reset-confirm-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('explica preservações e o backup antes da confirmação', async () => {
    await openReadyAndStartConfirm()
    expect(screen.getByText('Configurações da TV não serão apagadas.')).toBeTruthy()
    expect(screen.getByText('Dispositivos/kiosks não serão removidos.')).toBeTruthy()
    expect(screen.getByText('Solicitações de música não serão removidas.')).toBeTruthy()
    expect(screen.getByText(/Um backup será criado antes da exclusão/)).toBeTruthy()
    expect(screen.getByText(/Não será possível recuperar os dados após a expiração/)).toBeTruthy()
  })

  it('confirmação forte: botão bloqueado até a frase correta (case/trim insensíveis)', async () => {
    await openReadyAndStartConfirm()

    expect((screen.getByTestId('reset-confirm-button') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: 'APAGAR' } })
    expect((screen.getByTestId('reset-confirm-button') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: 'limpar' } })
    expect((screen.getByTestId('reset-confirm-button') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: '  limpar  ' } })
    expect((screen.getByTestId('reset-confirm-button') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: '' } })
    expect((screen.getByTestId('reset-confirm-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('executa purge após confirmação e mostra sucesso com backup id e resumo', async () => {
    await openReadyAndStartConfirm()
    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: 'LIMPAR' } })
    fireEvent.click(screen.getByTestId('reset-confirm-button'))

    expect(screen.getByText('Limpando…')).toBeTruthy()
    await screen.findByTestId('reset-success')

    expect(screen.getByText('Dados da TV limpos com sucesso.')).toBeTruthy()
    expect(screen.getByTestId('reset-success-total').textContent).toBe('106')
    expect(screen.getByTestId('reset-backup-id').textContent).toBe(shortBackupId(PURGE_OK_BODY.backupId))
    expect(screen.getByText('Playlists')).toBeTruthy()
    expect(screen.getByText('Avisos urgentes')).toBeTruthy()
  })

  it('envia apenas appId ao purgar — workspace_id só para resolução de membership', async () => {
    const { calls } = await openReadyAndStartConfirm()
    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: 'LIMPAR' } })
    fireEvent.click(screen.getByTestId('reset-confirm-button'))
    await screen.findByTestId('reset-success')

    const purgeCall = calls.find((c) => c.url.includes(PURGE_URL_PART))!
    expect(JSON.parse(String(purgeCall.init?.body))).toEqual({
      appId: 'tv',
      workspace_id: 'ws-1',
    })
  })

  it('duplo clique dispara um único purge', async () => {
    const { fetchMock } = await openReadyAndStartConfirm()
    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: 'LIMPAR' } })

    const button = screen.getByTestId('reset-confirm-button')
    fireEvent.click(button)
    fireEvent.click(button)

    await screen.findByTestId('reset-success')
    const purgeCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes(PURGE_URL_PART))
    expect(purgeCalls).toHaveLength(1)
  })

  it('durante o purge o modal não fecha (Escape, backdrop, cancelar e X bloqueados)', async () => {
    let resolvePurge!: (r: Response) => void
    const fetchMock = vi.fn((url: string | URL) => {
      if (String(url).includes(PURGE_URL_PART)) {
        return new Promise<Response>((resolve) => {
          resolvePurge = resolve
        })
      }
      return Promise.resolve(new Response(JSON.stringify(describeBody()), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={onClose} />,
    )
    await screen.findByTestId('reset-tables-list')
    fireEvent.click(screen.getByTestId('reset-start-button'))
    fireEvent.change(await screen.findByTestId('reset-confirm-input'), { target: { value: 'LIMPAR' } })
    fireEvent.click(screen.getByTestId('reset-confirm-button'))

    await waitFor(() => {
      if (!resolvePurge) throw new Error('purge ainda não disparou')
    })

    expect(screen.getByTestId('reset-cancel-button')).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('app-data-reset-overlay'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('app-data-reset-dialog')).toBeTruthy()

    resolvePurge(new Response(JSON.stringify(PURGE_OK_BODY), { status: 200 }))
    await screen.findByTestId('reset-success')
  })

  it('Escape fecha normalmente quando não está apagando', async () => {
    happyFetch()
    const onClose = vi.fn()
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={onClose} />,
    )
    await screen.findByTestId('reset-tables-list')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('erro no describe mostra mensagem e não oferece ação destrutiva', async () => {
    stubFetch([
      { url: DESCRIBE_URL_PART, status: 500, body: { error: 'Não foi possível calcular as contagens' } },
    ])
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
    )
    expect(await screen.findByTestId('reset-error')).toBeTruthy()
    expect(screen.queryByTestId('reset-confirm-button')).toBeNull()
  })

  it('erro no purge exibe mensagem segura do servidor', async () => {
    stubFetch([
      { url: DESCRIBE_URL_PART, body: describeBody() },
      {
        url: PURGE_URL_PART,
        status: 413,
        body: {
          error: 'O volume de dados excede o limite seguro de backup. Nada foi removido.',
          code: 'backup_too_large',
        },
      },
    ])
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
    )
    await screen.findByTestId('reset-tables-list')
    fireEvent.click(screen.getByTestId('reset-start-button'))
    fireEvent.change(await screen.findByTestId('reset-confirm-input'), { target: { value: 'LIMPAR' } })
    fireEvent.click(screen.getByTestId('reset-confirm-button'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Nada foi removido')
    expect(screen.getByTestId('reset-error-close')).toBeTruthy()
  })

  it('não menciona settings/devices como itens removidos na lista de contagens', async () => {
    happyFetch()
    renderWithProviders(
      <AppDataResetModal app={tv} workspace={makeWorkspace()} open onClose={() => {}} />,
    )
    await screen.findByTestId('reset-total')
    expect(screen.queryByTestId('count-workspace_app_settings')).toBeNull()
    expect(screen.queryByTestId('count-tv_devices')).toBeNull()
  })

  it('shortBackupId trunca ids longos e trata null', () => {
    expect(shortBackupId('b0ac0ffe-1111-2222-3333-444455556666')).toBe('b0ac0ffe')
    expect(shortBackupId('abc')).toBe('abc')
    expect(shortBackupId(null)).toBe('—')
  })
})
