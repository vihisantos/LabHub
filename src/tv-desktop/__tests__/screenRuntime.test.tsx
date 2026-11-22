import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SCREEN_APP_OPTIONS,
  screenAppLabel,
  resolveScreenApp,
  loadConfig,
  saveConfig,
  type DeviceConfig,
  type ScreenAppId,
} from '../config'
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

afterEach(() => {
  localStorage.clear()
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

/** Config legada de instalações que tinham o painel de Chamados no Desktop. */
function legacyChamadosConfig(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return makeConfig({
    screenApp: 'chamados-dashboard' as unknown as ScreenAppId,
    ...overrides,
  })
}

describe('resolveScreenApp — fallbacks seguros', () => {
  it('config antiga sem screenApp resolve para "tv"', () => {
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
  })

  it('screenApp legado de Chamados resolve para "tv"', () => {
    expect(resolveScreenApp(legacyChamadosConfig())).toBe('tv')
  })

  it('qualquer valor desconhecido cai em "tv" — a TV nunca fica vazia', () => {
    const invalid = ['painel', '', 'TV', null, 42, {}] as unknown as Array<DeviceConfig['screenApp']>
    for (const value of invalid) {
      expect(resolveScreenApp(makeConfig({ screenApp: value }))).toBe('tv')
    }
  })
})

describe('SCREEN_APP_OPTIONS — catálogo institucional', () => {
  it('contém exclusivamente a TV Corporativa', () => {
    expect(SCREEN_APP_OPTIONS.map((o) => o.id)).toEqual(['tv'])
  })

  it('rotula todos os módulos com texto não vazio e rotulo desconhecido cai no próprio id', () => {
    for (const opt of SCREEN_APP_OPTIONS) {
      expect(screenAppLabel(opt.id)).toBe(opt.label)
      expect(opt.label.trim()).not.toBe('')
      expect(opt.description.trim()).not.toBe('')
    }
    expect(screenAppLabel('lixo' as ScreenAppId)).toBe('lixo')
  })
})

describe('ScreenRenderer — apenas TV institucional', () => {
  it('renderiza a TV Corporativa', () => {
    render(<ScreenRenderer config={makeConfig({ screenApp: 'tv' })} />)
    expect(screen.getByTestId('tv-display-stub')).toHaveAttribute('data-device-name', 'TV Recepção')
  })

  it('screenApp legado de Chamados nunca renderiza Chamados', () => {
    render(<ScreenRenderer config={legacyChamadosConfig()} />)
    expect(screen.getByTestId('tv-display-stub')).toBeInTheDocument()
    expect(screen.queryByText('Painel de Chamados')).not.toBeInTheDocument()
  })

  it('screenApp inválido nunca quebra: renderiza a TV', () => {
    const broken = { screenApp: 'lixo' } as unknown as DeviceConfig
    render(<ScreenRenderer config={{ ...makeConfig(), ...broken }} />)
    expect(screen.getByTestId('tv-display-stub')).toBeInTheDocument()
  })
})

describe('Persistência de screenApp (Desktop local store / web localStorage)', () => {
  it('saveConfig → loadConfig preserva screenApp e todos os campos', async () => {
    await saveConfig(makeConfig({ screenApp: 'tv', deviceId: 'dev-2' }))
    const loaded = await loadConfig()

    expect(loaded?.screenApp).toBe('tv')
    expect(loaded).toEqual(makeConfig({ screenApp: 'tv', deviceId: 'dev-2' }))
  })

  it('config antiga (JSON sem screenApp) carrega, resolve "tv" e não é reescrita', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeConfig()))

    const loaded = await loadConfig()
    expect(loaded).toEqual(makeConfig())
    expect(resolveScreenApp(loaded)).toBe('tv')

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect('screenApp' in raw).toBe(false)
  })

  it('config legada de Chamados é carregada, mas resolve para TV', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyChamadosConfig({ deviceId: 'dev-3' })))

    const loaded = await loadConfig()
    expect(loaded?.screenApp).toBe('chamados-dashboard')
    expect(resolveScreenApp(loaded)).toBe('tv')
  })

  it('re-salvar a configuração não corrompe deviceId/workspace/name', async () => {
    await saveConfig(makeConfig())
    await saveConfig(
      makeConfig({ createdAt: '2026-07-01T10:00:00Z' }),
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

  it('config legada de Chamados também cai na TV na cadeia completa', () => {
    render(<DisplayShell config={legacyChamadosConfig()} onReconfigure={() => {}} />)
    expect(screen.getByTestId('tv-display-stub')).toBeInTheDocument()
    expect(screen.queryByText('Painel de Chamados')).not.toBeInTheDocument()
  })
})
