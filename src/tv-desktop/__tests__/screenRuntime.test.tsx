import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { resolveScreenApp, loadConfig, saveConfig, type DeviceConfig } from '../config'
import { ScreenRenderer } from '../ScreenRenderer'
import { DisplayShell } from '../DisplayShell'
import type { Workspace } from '../../core/workspaces/types'

const STORAGE_KEY = 'labhub_tv_device_config'

/* Stub da TV: permite afirmar qual tela o renderer escolheu sem montar
 * hooks/supabase reais do app de TV. */
vi.mock('../../apps/tv/pages/TvDisplay', () => ({
  TvDisplay: ({ deviceName }: { deviceName?: string }) => (
    <div data-testid="tv-display-stub" data-device-name={deviceName ?? ''} />
  ),
}))

/* O painel de chamados é uma implementação real: a integração via
 * ScreenRenderer precisa da sessão do kiosk e do fetch stubados. O mock
 * também cobre realtime (ThemeContext/MusicPlayer usam canais encadeados). */
const mockSupabase = vi.hoisted(() => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: () => Promise.resolve('ok'),
    send: () => Promise.resolve('ok'),
    track: () => Promise.resolve('ok'),
    untrack: () => Promise.resolve('ok'),
  }
  return {
    auth: { getSession: vi.fn() },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
})

vi.mock('../../lib/supabase', () => ({
  defaultDb: mockSupabase,
  pcareDb: null,
  stockDb: null,
}))

const DASHBOARD_SNAPSHOT = {
  generatedAt: '2026-06-25T12:00:00Z',
  summary: {
    total: 1, open: 1, inProgress: 0, highPriority: 0,
    avgResolutionHours: null, satisfaction: null,
  },
  tickets: [{
    ticketNumber: 101, roomName: 'Lab 204', problemArea: 'Computador',
    problemCategory: 'Hardware', priority: 'alta', status: 'aberto',
    createdAt: '2026-06-25T10:00:00Z', resolvedAt: null,
  }],
}

/** Consome microtasks dos efeitos assíncronos (fake timers globais). */
async function flushDashboard() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  mockSupabase.auth.getSession.mockReset()
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'kiosk-token' } },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => DASHBOARD_SNAPSHOT,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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

function makeConfig(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    deviceId: 'dev-1',
    name: 'TV Recepção',
    workspace: makeWorkspace(),
    createdAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

describe('resolveScreenApp — fallbacks seguros', () => {
  it('config antiga sem screenApp resolve para "tv"', () => {
    // Simula instalação existente: objeto persistido sem a chave screenApp
    const { screenApp: _omitted, ...legacy } = makeConfig({ screenApp: 'tv' })
    void _omitted
    expect(resolveScreenApp(legacy)).toBe('tv')
  })

  it('config ausente resolve para "tv"', () => {
    expect(resolveScreenApp(null)).toBe('tv')
    expect(resolveScreenApp(undefined)).toBe('tv')
  })

  it('valor válido é preservado', () => {
    expect(resolveScreenApp(makeConfig({ screenApp: 'tv' }))).toBe('tv')
    expect(resolveScreenApp(makeConfig({ screenApp: 'chamados-dashboard' }))).toBe(
      'chamados-dashboard',
    )
  })

  it('qualquer valor desconhecido cai em "tv" — a TV nunca fica vazia', () => {
    const invalid = ['painel', '', 'TV', null, 42, {}] as unknown as Array<DeviceConfig['screenApp']>
    for (const value of invalid) {
      expect(resolveScreenApp(makeConfig({ screenApp: value }))).toBe('tv')
    }
  })
})

describe('ScreenRenderer — decisão de tela', () => {
  it('screenApp "tv" renderiza a TV Corporativa', () => {
    render(<ScreenRenderer config={makeConfig({ screenApp: 'tv' })} />)
    expect(screen.getByTestId('tv-display-stub')).toHaveAttribute('data-device-name', 'TV Recepção')
  })

  it('"chamados-dashboard" renderiza o painel de chamados na TV', async () => {
    render(<ScreenRenderer config={makeConfig({ screenApp: 'chamados-dashboard' })} />)
    await flushDashboard()

    expect(screen.queryByTestId('tv-display-stub')).not.toBeInTheDocument()
    expect(screen.getByText('Painel de Chamados')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
  })

  it('screenApp inválido nunca quebra: renderiza a TV', () => {
    const broken = { screenApp: 'lixo' } as unknown as DeviceConfig
    render(<ScreenRenderer config={{ ...makeConfig(), ...broken }} />)
    expect(screen.getByTestId('tv-display-stub')).toBeInTheDocument()
  })
})

describe('Persistência de screenApp (Electron SQLite / web localStorage)', () => {
  it('saveConfig → loadConfig preserva screenApp e todos os campos', async () => {
    await saveConfig(makeConfig({ screenApp: 'chamados-dashboard', deviceId: 'dev-2' }))
    const loaded = await loadConfig()

    expect(loaded?.screenApp).toBe('chamados-dashboard')
    expect(loaded).toEqual(makeConfig({ screenApp: 'chamados-dashboard', deviceId: 'dev-2' }))
  })

  it('config antiga (JSON sem screenApp) carrega, resolve "tv" e não é reescrita', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeConfig()))

    const loaded = await loadConfig()
    expect(loaded).toEqual(makeConfig())
    expect(resolveScreenApp(loaded)).toBe('tv')

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect('screenApp' in raw).toBe(false)
  })

  it('re-salvar a configuração não corrompe deviceId/workspace/name', async () => {
    await saveConfig(makeConfig())
    await saveConfig(
      makeConfig({ screenApp: 'chamados-dashboard', createdAt: '2026-07-01T10:00:00Z' }),
    )

    const loaded = await loadConfig()
    expect(loaded?.deviceId).toBe('dev-1')
    expect(loaded?.workspace).toEqual(makeWorkspace())
    expect(loaded?.name).toBe('TV Recepção')
  })
})

describe('Fluxo existente — DisplayShell → ScreenRenderer → TvDisplay', () => {
  it('a cadeia completa do kiosk continua renderizando a TV', () => {
    render(<DisplayShell config={makeConfig()} onReconfigure={() => {}} />)
    expect(screen.getByTestId('tv-display-stub')).toBeInTheDocument()
  })
})
