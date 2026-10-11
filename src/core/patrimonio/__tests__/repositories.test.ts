import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PatrimonioAssetUpdateInput } from '../types'

/**
 * Testes da camada de dados do Patrimônio.
 *
 * O mock abaixo imita a cadeia do supabase-js (`.from().select()...`), que é
 * "entãoável" — por isso o builder implementa `then`. Assim exercitamos os
 * repositórios reais contra uma borda falsa, sem rede e sem DB.
 */

const { mockFrom, store } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  store: { activeWorkspaceId: 'ws-1' as string | null },
}))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom },
}))
vi.mock('../../workspaces/store', () => ({
  workspaceStore: store,
}))
vi.mock('../../auth/service', () => ({
  authService: { getCurrentUser: () => ({ id: 'user-1' }) },
}))

interface QueryCalls {
  table?: string
  select?: string
  eqs: Array<[string, unknown]>
  order?: [string, { ascending?: boolean }]
  range?: [number, number]
  or?: string
  inserted?: Record<string, unknown>
  updated?: Record<string, unknown>
  deleted: boolean
  single: boolean
}

let result: { data: unknown; error: unknown }
let calls: QueryCalls

function freshCalls(): QueryCalls {
  return { eqs: [], deleted: false, single: false }
}

function makeBuilder() {
  const b = {
    select(sel: string) {
      calls.select = sel
      return b
    },
    insert(payload: Record<string, unknown>) {
      calls.inserted = payload
      return b
    },
    update(payload: Record<string, unknown>) {
      calls.updated = payload
      return b
    },
    delete() {
      calls.deleted = true
      return b
    },
    eq(col: string, val: unknown) {
      calls.eqs.push([col, val])
      return b
    },
    order(col: string, opts: { ascending?: boolean }) {
      calls.order = [col, opts]
      return b
    },
    range(from: number, to: number) {
      calls.range = [from, to]
      return b
    },
    or(expr: string) {
      calls.or = expr
      return b
    },
    single() {
      calls.single = true
      return Promise.resolve(result)
    },
    maybeSingle() {
      return Promise.resolve(result)
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return b
}

function assetRow(over: Record<string, unknown> = {}) {
  return {
    id: 'a-1',
    workspace_id: 'ws-1',
    asset_tag: 'PAT-001',
    serial_number: 'SN-1',
    equipment_type: 'Notebook',
    manufacturer: 'Dell',
    model: 'Latitude',
    name: 'Notebook Dell',
    location_id: null,
    responsible_id: null,
    status: 'draft',
    condition: 'bom',
    notes: '',
    metadata: {},
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function movementRow(over: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    workspace_id: 'ws-1',
    asset_id: 'a-1',
    type: 'emprestimo',
    to_location_id: null,
    to_responsible_id: 'r-1',
    to_status: 'emprestado',
    to_responsible_nome: 'Fulano',
    to_responsible_matricula: null,
    expected_return_at: '2026-07-01T00:00:00Z',
    note: '',
    performed_by: 'user-1',
    performed_by_nome: 'Admin',
    source: 'ui',
    import_batch_id: null,
    created_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

async function loadAssets() {
  vi.resetModules()
  return (await import('../assets')).assetsRepository
}
async function loadLocations() {
  vi.resetModules()
  return (await import('../locations')).locationsRepository
}
async function loadResponsibles() {
  vi.resetModules()
  return (await import('../responsibles')).responsiblesRepository
}
async function loadMovements() {
  vi.resetModules()
  return (await import('../movements')).movementsRepository
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: [], error: null }
  calls = freshCalls()
  store.activeWorkspaceId = 'ws-1'
  mockFrom.mockImplementation((table: string) => {
    calls.table = table
    return makeBuilder()
  })
})

// ---------------------------------------------------------------------------

describe('assetsRepository', () => {
  it('lista escopado ao workspace, com paginação e busca sanitizada', async () => {
    result = { data: [assetRow()], error: null }
    const assets = await loadAssets()

    const rows = await assets.list({ status: 'disponivel', search: 'dell, (x)' })

    expect(calls.table).toBe('assets')
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-1'])
    expect(calls.eqs).toContainEqual(['status', 'disponivel'])
    // vírgula/parênteses removidos para não quebrar a sintaxe de `.or()`
    expect(calls.or).toBe(
      'name.ilike.%dell x%,asset_tag.ilike.%dell x%,serial_number.ilike.%dell x%',
    )
    expect(calls.range).toEqual([0, 199])
    expect(rows[0].id).toBe('a-1')
    expect(rows[0].status).toBe('draft')
    expect(rows[0].condition).toBe('bom')
    expect(rows[0].responsible_id).toBeNull()
  })

  it('respeita limit/offset informados (limitado ao máximo)', async () => {
    const assets = await loadAssets()
    result = { data: [], error: null }
    await assets.list({ limit: 50, offset: 100 })
    expect(calls.range).toEqual([100, 149])

    calls = freshCalls()
    await assets.list({ limit: 99999 })
    expect(calls.range).toEqual([0, 999])
  })

  it('cria no workspace informado com estado inicial de custódia (criacao vira histórico 094)', async () => {
    result = { data: assetRow({ name: 'Novo', equipment_type: 'Monitor' }), error: null }
    const assets = await loadAssets()

    // store ativo = 'ws-1', mas a criação deve ir para 'ws-B' (unidade informada).
    await assets.create(
      {
        name: '  Novo  ',
        equipment_type: ' Monitor ',
        asset_tag: '  PAT-009  ',
        location_id: 'l-2',
        responsible_id: 'r-2',
      },
      'ws-B',
    )

    expect(calls.inserted).toMatchObject({
      name: 'Novo',
      equipment_type: 'Monitor',
      asset_tag: 'PAT-009',
      location_id: 'l-2',
      responsible_id: 'r-2',
      status: 'draft',
      workspace_id: 'ws-B',
      created_by: 'user-1',
    })
    expect(calls.single).toBe(true)
  })

  it('status inicial inválido ⇒ erro de validação (sem round-trip)', async () => {
    const assets = await loadAssets()
    await expect(
      assets.create(
        { name: 'X', equipment_type: 'Monitor', status: 'inventado' } as never,
        'ws-1',
      ),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('normaliza referências vazias para null e aplica defaults de custódia', async () => {
    result = { data: assetRow({ name: 'Novo' }), error: null }
    const assets = await loadAssets()
    await assets.create(
      { name: 'Novo', equipment_type: 'Monitor', location_id: '  ', responsible_id: '' },
      'ws-1',
    )
    expect(calls.inserted).toMatchObject({
      location_id: null,
      responsible_id: null,
      status: 'draft',
    })
  })

  it('rejeita criação sem nome (validação local, sem round-trip)', async () => {
    const assets = await loadAssets()
    await expect(
      assets.create({ name: '   ', equipment_type: 'Monitor' }, 'ws-1'),
    ).rejects.toMatchObject(
      { code: 'validation' },
    )
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('update remove campos proibidos, mesmo que enviados', async () => {
    result = { data: assetRow({ name: 'Alterado' }), error: null }
    const assets = await loadAssets()

    const forbidden = {
      name: 'Alterado',
      location_id: 'l-9',
      responsible_id: 'r-9',
      status: 'baixado',
      created_at: 'hack',
    } as unknown as PatrimonioAssetUpdateInput

    await assets.update('a-1', forbidden, 'ws-1')

    expect(calls.updated).toMatchObject({ name: 'Alterado' })
    expect(calls.updated).not.toHaveProperty('location_id')
    expect(calls.updated).not.toHaveProperty('responsible_id')
    expect(calls.updated).not.toHaveProperty('status')
    expect(calls.updated).not.toHaveProperty('created_at')
    expect(calls.eqs).toContainEqual(['id', 'a-1'])
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-1'])
  })

  it('update vazio ⇒ erro de validação (nada a fazer)', async () => {
    const assets = await loadAssets()
    await expect(assets.update('a-1', {}, 'ws-1')).rejects.toMatchObject({ code: 'validation' })
  })

  it('get usa single e escopa por id + workspace', async () => {
    result = { data: assetRow(), error: null }
    const assets = await loadAssets()
    const asset = await assets.get('a-1')
    expect(asset.id).toBe('a-1')
    expect(calls.single).toBe(true)
    expect(calls.eqs).toContainEqual(['id', 'a-1'])
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-1'])
  })

  it('escopa pela unidade informada, ignorando a unidade ativa (isolamento por unidade)', async () => {
    // store ativo = 'ws-1'; a consulta deve ir para 'ws-B' quando informada.
    result = { data: [assetRow()], error: null }
    const assets = await loadAssets()
    await assets.list({ workspaceId: 'ws-B' })
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-B'])
    expect(calls.eqs).not.toContainEqual(['workspace_id', 'ws-1'])
  })

  it('get escopa pela unidade informada', async () => {
    result = { data: assetRow(), error: null }
    const assets = await loadAssets()
    await assets.get('a-1', 'ws-B')
    expect(calls.eqs).toContainEqual(['id', 'a-1'])
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-B'])
  })

  it('erro de unicidade (23505) ⇒ conflict', async () => {
    result = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const assets = await loadAssets()
    await expect(assets.create({ name: 'X', equipment_type: 'Monitor' }, 'ws-1')).rejects.toMatchObject(
      { code: 'conflict' },
    )
  })

  it('erro de RLS (42501) ⇒ permission_denied', async () => {
    result = { data: null, error: { code: '42501', message: 'permission denied' } }
    const assets = await loadAssets()
    await expect(assets.create({ name: 'X', equipment_type: 'Monitor' }, 'ws-1')).rejects.toMatchObject(
      { code: 'permission_denied' },
    )
  })

  it('sem workspace ativo ⇒ fail-closed (no_workspace)', async () => {
    store.activeWorkspaceId = null
    const assets = await loadAssets()
    await expect(assets.list()).rejects.toMatchObject({ code: 'no_workspace' })
  })
})

// ---------------------------------------------------------------------------

describe('locationsRepository', () => {
  it('cria com nome obrigatório e trims aplicados', async () => {
    result = {
      data: { id: 'l-1', workspace_id: 'ws-1', predio: 'A', andar: '2', nome: 'Sala', complemento: '', notes: '', created_at: '', updated_at: '' },
      error: null,
    }
    const locations = await loadLocations()
    await locations.create({ nome: '  Sala  ', predio: ' A ' })
    expect(calls.inserted).toMatchObject({ nome: 'Sala', predio: 'A', workspace_id: 'ws-1' })
  })

  it('rejeita nome vazio', async () => {
    const locations = await loadLocations()
    await expect(locations.create({ nome: '   ' })).rejects.toMatchObject({ code: 'validation' })
  })
})

// ---------------------------------------------------------------------------

describe('responsiblesRepository', () => {
  it('normaliza opcionais vazios para null (responsável sem conta LabHub é válido)', async () => {
    result = {
      data: { id: 'r-1', workspace_id: 'ws-1', nome: 'Fulano', matricula: null, email: null, profile_id: null, notes: '', created_at: '', updated_at: '' },
      error: null,
    }
    const responsibles = await loadResponsibles()
    await responsibles.create({ nome: 'Fulano', matricula: '   ', email: '', profile_id: undefined })
    expect(calls.inserted).toMatchObject({
      nome: 'Fulano',
      matricula: null,
      email: null,
      profile_id: null,
      workspace_id: 'ws-1',
    })
  })

  it('rejeita nome vazio', async () => {
    const responsibles = await loadResponsibles()
    await expect(responsibles.create({ nome: '' })).rejects.toMatchObject({ code: 'validation' })
  })
})

// ---------------------------------------------------------------------------

describe('movementsRepository — único caminho de mutação (append-only)', () => {
  it('NÃO expõe update nem remove (histórico imutável)', async () => {
    const movements = await loadMovements()
    const keys = Object.keys(movements)
    expect(keys).toEqual(expect.arrayContaining(['listByAsset', 'listRecent', 'register']))
    expect((movements as unknown as Record<string, unknown>).update).toBeUndefined()
    expect((movements as unknown as Record<string, unknown>).remove).toBeUndefined()
    expect((movements as unknown as Record<string, unknown>).delete).toBeUndefined()
  })

  it('registra empréstimo e NÃO envia autoria/proveniência (definidas pela trigger)', async () => {
    result = { data: movementRow(), error: null }
    const movements = await loadMovements()

    await movements.register({
      asset_id: 'a-1',
      type: 'emprestimo',
      to_responsible_id: 'r-1',
      expected_return_at: '2026-07-01T00:00:00Z',
    })

    expect(calls.inserted).toMatchObject({
      workspace_id: 'ws-1',
      asset_id: 'a-1',
      type: 'emprestimo',
      to_responsible_id: 'r-1',
      expected_return_at: '2026-07-01T00:00:00Z',
    })
    expect(calls.inserted).not.toHaveProperty('performed_by')
    expect(calls.inserted).not.toHaveProperty('performed_by_nome')
    expect(calls.inserted).not.toHaveProperty('source')
    expect(calls.inserted).not.toHaveProperty('to_responsible_nome')
    expect(calls.table).toBe('asset_movements')
  })

  it('emprestimo sem responsável/data ⇒ erro local (sem round-trip)', async () => {
    const movements = await loadMovements()
    await expect(
      movements.register({ asset_id: 'a-1', type: 'emprestimo' }),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('transferencia exige local e status de destino válido', async () => {
    const movements = await loadMovements()
    await expect(
      movements.register({ asset_id: 'a-1', type: 'transferencia' }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      movements.register({ asset_id: 'a-1', type: 'transferencia', to_location_id: 'l-1', to_status: 'baixado' }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('criacao não é registrável pelo cliente', async () => {
    const movements = await loadMovements()
    await expect(
      movements.register({ asset_id: 'a-1', type: 'criacao' as never }),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('erro 42501 (RLS/RBAC) em operação válida ⇒ permission_denied', async () => {
    result = { data: null, error: { code: '42501', message: 'denied' } }
    const movements = await loadMovements()
    await expect(
      movements.register({ asset_id: 'a-1', type: 'manutencao' }),
    ).rejects.toMatchObject({ code: 'permission_denied' })
  })

  it('lista histórico do ativo com limite padrão', async () => {
    result = { data: [movementRow()], error: null }
    const movements = await loadMovements()
    const rows = await movements.listByAsset('a-1')
    expect(calls.table).toBe('asset_movements')
    expect(calls.eqs).toContainEqual(['asset_id', 'a-1'])
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-1'])
    expect(calls.range).toEqual([0, 99])
    expect(rows[0].type).toBe('emprestimo')
    expect(rows[0].to_status).toBe('emprestado')
  })

  it('escopa o histórico pela unidade informada', async () => {
    result = { data: [movementRow()], error: null }
    const movements = await loadMovements()
    await movements.listByAsset('a-1', { workspaceId: 'ws-B' })
    expect(calls.eqs).toContainEqual(['workspace_id', 'ws-B'])
    expect(calls.eqs).not.toContainEqual(['workspace_id', 'ws-1'])
  })
})
