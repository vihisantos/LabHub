import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Mock do Supabase: builder encadeável com registro de chamadas ── */
const state = {
  eqCalls: [] as Array<[string, unknown]>,
  rows: [] as unknown[],           // resultados na ordem das chamadas (fila)
  upserts: [] as Array<{ payload: unknown; opts: unknown }>,
  selectCalledWith: [] as string[],
  failNextSelect: null as null | { message: string },
}

function makeBuilder(_table?: string) {
  const builder: Record<string, unknown> = {}
  const result = () => {
    if (state.failNextSelect) {
      const err = state.failNextSelect
      state.failNextSelect = null
      return Promise.resolve({ data: null, error: err })
    }
    const row = state.rows.shift() ?? null
    return Promise.resolve({ data: row, error: null })
  }
  Object.assign(builder, {
    select: (_cols: string) => {
      state.selectCalledWith.push(_cols)
      return builder
    },
    eq: (col: string, value: unknown) => {
      state.eqCalls.push([col, value])
      return builder
    },
    single: () => result(),
    maybeSingle: () => result(),
    upsert: async (payload: unknown, opts?: unknown) => {
      state.upserts.push({ payload, opts })
      return { data: null, error: null }
    },
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  })
  return builder
}

vi.mock('../../../lib/supabase', () => ({
  defaultDb: {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
  },
}))

/* ── Registry fake: apps com/sem definição (vi.hoisted: fábrica do mock é hoisted) ── */
interface TestSettings { display: { refreshIntervalSeconds: number; tickerLabel: string }; features: { calendar: boolean } }

const testDefaults = vi.hoisted(() => ({
  display: { refreshIntervalSeconds: 300, tickerLabel: 'LabHub' },
  features: { calendar: true },
}))

const fakeRegistry = vi.hoisted(() => [
  {
    id: 'test-app',
    name: 'Test App',
    description: '',
    icon: (): null => null,
    route: '/test-app',
    color: '#000',
    settings: {
      defaultSettings: testDefaults,
      validateSettings: (value: unknown) => {
        const v = value as { display: { refreshIntervalSeconds: number } }
        if (typeof v.display.refreshIntervalSeconds !== 'number' || v.display.refreshIntervalSeconds < 10) {
          throw new Error('refreshIntervalSeconds inválido')
        }
        return value
      },
    },
  },
  {
    id: 'chamados',
    name: 'Chamados',
    description: '',
    icon: (): null => null,
    route: '/chamados',
    color: '#000',
    // sem settings definition
  },
])

vi.mock('../../../appRegistry', () => ({ appRegistry: fakeRegistry }))

vi.mock('../../../core/workspaces/store', async () => {
  const actual = await vi.importActual<typeof import('../../../core/workspaces/store')>('../../../core/workspaces/store')
  return actual
})

import { workspaceStore } from '../../../core/workspaces/store'
import { appSettingsService, deepMerge } from '../service'

function setWorkspace(id: string | null) {
  workspaceStore.set(
    id
      ? { id, name: id, slug: id, location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' }
      : null,
    false,
    [],
  )
}

beforeEach(() => {
  state.eqCalls = []
  state.rows = []
  state.upserts = []
  state.selectCalledWith = []
  state.failNextSelect = null
  setWorkspace('ws-a')
  appSettingsService.clearCache()
})

describe('deepMerge', () => {
  it('mescla objetos aninhados sem substituir irmãos', () => {
    const merged = deepMerge(testDefaults, { display: { refreshIntervalSeconds: 600 } })
    expect(merged).toEqual({
      display: { refreshIntervalSeconds: 600, tickerLabel: 'LabHub' },
      features: { calendar: true },
    })
  })

  it('substitui arrays por inteiro', () => {
    expect(deepMerge({ items: [1, 2] as number[] }, { items: [9] })).toEqual({ items: [9] })
  })
})

describe('appSettingsService.getSettings', () => {
  it('retorna defaults quando não há settings persistidos', async () => {
    state.rows = [null]
    const result = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(result).toEqual(testDefaults)
  })

  it('carrega e mescla settings persistidos (merge profundo)', async () => {
    state.rows = [{ settings: { display: { refreshIntervalSeconds: 600 }, features: {} }, updated_at: '2026-08-01T10:00:00Z' }]
    const result = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(result).toEqual({
      display: { refreshIntervalSeconds: 600, tickerLabel: 'LabHub' },
      features: { calendar: true },
    })
  })

  it('settings válidos passam pela validação intactos', async () => {
    state.rows = [{ settings: { display: { refreshIntervalSeconds: 999 } }, updated_at: null }]
    const result = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(result.display.refreshIntervalSeconds).toBe(999)
  })

  it('JSON inválido persistido -> defaults + erro registrado, sem quebrar', async () => {
    state.rows = [{ settings: 'nao-sou-um-objeto', updated_at: null }]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(result).toEqual(testDefaults)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('validateSettings lançando -> defaults seguros', async () => {
    state.rows = [{ settings: { display: { refreshIntervalSeconds: -5 } }, updated_at: null }]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(result).toEqual(testDefaults)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('falha de rede -> defaults sem popular cache (tenta de novo depois)', async () => {
    state.failNextSelect = { message: 'network down' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(first).toEqual(testDefaults)
    spy.mockRestore()

    state.rows = [{ settings: { display: { refreshIntervalSeconds: 120 } }, updated_at: null }]
    const second = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(second.display.refreshIntervalSeconds).toBe(120)
  })

  it('cacheia por workspace+app: segunda leitura não refaz requisição', async () => {
    state.rows = [{ settings: {}, updated_at: null }]
    await appSettingsService.getSettings('test-app')
    await appSettingsService.getSettings('test-app')
    expect(state.selectCalledWith.length).toBe(1)
  })

  it('workspace B nunca lê cache do workspace A (e vice-versa)', async () => {
    state.rows = [{ settings: { display: { refreshIntervalSeconds: 111 } }, updated_at: null }]
    const fromA = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(fromA.display.refreshIntervalSeconds).toBe(111)

    setWorkspace('ws-b')
    state.rows = [{ settings: { display: { refreshIntervalSeconds: 222 } }, updated_at: null }]
    const fromB = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(fromB.display.refreshIntervalSeconds).toBe(222)
    expect(fromB.display.tickerLabel).toBe('LabHub') // defaults aplicados, nada vazou de A

    // consulta de B foi filtrada pelo workspace correto
    const lastEq = state.eqCalls.slice(-2)
    expect(lastEq).toEqual([['workspace_id', 'ws-b'], ['app_id', 'test-app']])

    // voltar ao A reutiliza o cache de A (não pega valor de B)
    setWorkspace('ws-a')
    const againA = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(againA.display.refreshIntervalSeconds).toBe(111)
    expect(state.selectCalledWith.length).toBe(2)
  })

  it('rejeita sem workspace ativo', async () => {
    setWorkspace(null)
    await expect(appSettingsService.getSettings('test-app')).rejects.toThrow('Nenhum workspace ativo')
  })

  it('app desconhecido e app sem definição têm comportamento definido', async () => {
    await expect(appSettingsService.getSettings('inexistente')).rejects.toThrow('App não registrado')
    await expect(appSettingsService.getSettings('chamados')).rejects.toThrow('sem definição de settings')
  })
})

describe('appSettingsService.upsertSettings', () => {
  it('faz upsert do merge validado e atualiza o cache imediatamente', async () => {
    state.rows = [null] // primeira leitura: sem row
    const saved = await appSettingsService.upsertSettings<TestSettings>('test-app', {
      display: { refreshIntervalSeconds: 600 },
    })
    expect(saved).toEqual({
      display: { refreshIntervalSeconds: 600, tickerLabel: 'LabHub' },
      features: { calendar: true },
    })

    expect(state.upserts.length).toBe(1)
    const { payload, opts } = state.upserts[0]
    expect(payload).toMatchObject({
      workspace_id: 'ws-a',
      app_id: 'test-app',
      settings: saved,
      updated_by: 'user-1',
    })
    expect(opts).toEqual({ onConflict: 'workspace_id,app_id' })

    // cache atualizado: get seguinte NÃO refaz SELECT e já vê o novo valor
    const cached = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(cached.display.refreshIntervalSeconds).toBe(600)
    expect(state.selectCalledWith.length).toBe(1)
  })

  it('invalidação força nova leitura do servidor', async () => {
    state.rows = [null]
    await appSettingsService.upsertSettings<TestSettings>('test-app', { display: { tickerLabel: 'Campus' } })
    appSettingsService.invalidate('test-app')
    state.rows = [{ settings: { display: { tickerLabel: 'Servidor' } }, updated_at: null }]
    const fresh = await appSettingsService.getSettings<TestSettings>('test-app')
    expect(fresh.display.tickerLabel).toBe('Servidor')
  })

  it('patch inválido é rejeitado antes de gravar', async () => {
    state.rows = [null]
    await expect(
      appSettingsService.upsertSettings<TestSettings>('test-app', { display: { refreshIntervalSeconds: 1 } }),
    ).rejects.toThrow('refreshIntervalSeconds inválido')
    expect(state.upserts.length).toBe(0)
  })
})

describe('superfície da API (mapeamento para RLS da migration 031)', () => {
  it('expõe apenas leitura/upsert — nunca update/delete diretos', () => {
    expect(Object.keys(appSettingsService).sort()).toEqual([
      'clearCache',
      'getSettings',
      'getUpdatedAt',
      'invalidate',
      'upsertSettings',
    ])
  })
})
