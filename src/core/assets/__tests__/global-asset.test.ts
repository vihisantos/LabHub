import { describe, it, expect, beforeEach, vi } from 'vitest'
import { globalAssetRepository } from '../global-repository'
import { setCol, resetCache } from '../../../lib/db'
import { clearDirty, getDirtyCollections } from '../../../lib/sync'
import { workspaceStore } from '../../workspaces/store'
import type { GlobalAsset } from '../global-types'

vi.mock('../../../lib/supabase', () => ({
  defaultDb: null,
  pcareDb: null,
  stockDb: null,
}))

vi.mock('../../auth/service', () => ({
  authService: {
    getCurrentUser: vi.fn(() => ({
      id: 'user-1',
      email: 'test@labhub.com',
      name: 'Test User',
      workspace_ids: ['ws-1'],
      is_super_admin: false,
    })),
  },
}))

function makeAsset(overrides: Partial<GlobalAsset> = {}): GlobalAsset {
  return {
    id: crypto.randomUUID(),
    workspace_id: 'ws-1',
    asset_tag: null,
    serial_number: null,
    equipment_type: 'Desktop',
    manufacturer: '',
    model: '',
    name: '',
    location_id: null,
    status: 'draft',
    notes: '',
    metadata: {},
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  resetCache()
  localStorage.clear()
  workspaceStore.set(null, false, [])
})

describe('globalAssetRepository — CRUD', () => {
  it('getAll retorna lista vazia inicialmente', () => {
    expect(globalAssetRepository.getAll()).toEqual([])
  })

  it('create adiciona asset com id gerado', () => {
    const asset = globalAssetRepository.create({
      name: 'PC Lab A',
      equipment_type: 'Desktop',
      manufacturer: 'Dell',
      model: 'OptiPlex',
      asset_tag: 'TI-001',
      serial_number: null,
      location_id: null,
      status: 'active',
      notes: '',
      metadata: {},
    })

    expect(asset.id).toBeDefined()
    expect(asset.name).toBe('PC Lab A')
    expect(asset.equipment_type).toBe('Desktop')
    expect(asset.manufacturer).toBe('Dell')
    expect(asset.model).toBe('OptiPlex')
    expect(asset.asset_tag).toBe('TI-001')
    expect(asset.created_at).toBeDefined()
    expect(asset.updated_at).toBeDefined()
  })

  it('create atribui workspace_id do workspace ativo', () => {
    workspaceStore.set(
      { id: 'ws-2', name: 'Campus B', slug: 'campus-b', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-2'],
    )

    const asset = globalAssetRepository.create({
      name: 'Monitor',
      equipment_type: 'Monitor',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    expect(asset.workspace_id).toBe('ws-2')
  })

  it('create atribui created_by do usuário autenticado', () => {
    const asset = globalAssetRepository.create({
      name: 'Teste',
      equipment_type: 'Outro',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    expect(asset.created_by).toBe('user-1')
  })

  it('getById retorna asset existente', () => {
    const asset = globalAssetRepository.create({
      name: 'Buscar',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    const found = globalAssetRepository.getById(asset.id)
    expect(found?.name).toBe('Buscar')
  })

  it('getById retorna undefined para id inexistente', () => {
    expect(globalAssetRepository.getById('nonexistent')).toBeUndefined()
  })

  it('update modifica campos e atualiza updated_at', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'))

    const asset = globalAssetRepository.create({
      name: 'Original',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    const originalUpdatedAt = asset.updated_at

    vi.setSystemTime(new Date('2026-01-01T10:00:01.000Z'))
    const updated = globalAssetRepository.update(asset.id, { name: 'Atualizado' })

    expect(updated?.name).toBe('Atualizado')
    expect(updated?.updated_at).not.toBe(originalUpdatedAt)
    expect(updated?.updated_at).toBe('2026-01-01T10:00:01.000Z')

    vi.useRealTimers()
  })

  it('update retorna undefined para id inexistente', () => {
    expect(globalAssetRepository.update('nonexistent', { name: 'x' })).toBeUndefined()
  })

  it('remove deleta asset', () => {
    const asset = globalAssetRepository.create({
      name: 'Deletar',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    expect(globalAssetRepository.remove(asset.id)).toBe(true)
    expect(globalAssetRepository.getById(asset.id)).toBeUndefined()
  })

  it('remove retorna false para id inexistente', () => {
    expect(globalAssetRepository.remove('nonexistent')).toBe(false)
  })

  it('query filtra por predicado', () => {
    globalAssetRepository.create({
      name: 'A',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'active',
      notes: '',
      metadata: {},
    })
    globalAssetRepository.create({
      name: 'B',
      equipment_type: 'Monitor',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    const active = globalAssetRepository.query((a) => a.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0].name).toBe('A')
  })
})

describe('globalAssetRepository — busca por identificadores', () => {
  it('getByAssetTag retorna asset por patrimônio', () => {
    globalAssetRepository.create({
      name: 'Com Tag',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: 'PAT-001',
      serial_number: null,
      location_id: null,
      status: 'active',
      notes: '',
      metadata: {},
    })

    const found = globalAssetRepository.getByAssetTag('PAT-001')
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('Com Tag')
  })

  it('getByAssetTag retorna vazio para tag inexistente', () => {
    expect(globalAssetRepository.getByAssetTag('NAO-EXISTS')).toEqual([])
  })

  it('getBySerial retorna asset por serial number', () => {
    globalAssetRepository.create({
      name: 'Com Serial',
      equipment_type: 'Notebook',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: 'SN-12345',
      location_id: null,
      status: 'active',
      notes: '',
      metadata: {},
    })

    const found = globalAssetRepository.getBySerial('SN-12345')
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('Com Serial')
  })
})

describe('globalAssetRepository — estatísticas', () => {
  it('getStats retorna contadores zerados quando vazio', () => {
    const stats = globalAssetRepository.getStats()
    expect(stats.total).toBe(0)
    expect(stats.byStatus).toEqual({})
    expect(stats.byType).toEqual({})
  })

  it('getStats contabiliza por status e tipo', () => {
    globalAssetRepository.create({
      name: 'Desktop 1',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'active',
      notes: '',
      metadata: {},
    })
    globalAssetRepository.create({
      name: 'Desktop 2',
      equipment_type: 'Desktop',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'active',
      notes: '',
      metadata: {},
    })
    globalAssetRepository.create({
      name: 'Monitor 1',
      equipment_type: 'Monitor',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'maintenance',
      notes: '',
      metadata: {},
    })

    const stats = globalAssetRepository.getStats()
    expect(stats.total).toBe(3)
    expect(stats.byStatus.active).toBe(2)
    expect(stats.byStatus.maintenance).toBe(1)
    expect(stats.byType.Desktop).toBe(2)
    expect(stats.byType.Monitor).toBe(1)
  })
})

describe('globalAssetRepository — workspace isolation (local)', () => {
  it('getAll filtra por workspace ativo', () => {
    const ws1 = makeAsset({ id: 'a1', workspace_id: 'ws-1', name: 'Asset WS1' })
    const ws2 = makeAsset({ id: 'a2', workspace_id: 'ws-2', name: 'Asset WS2' })
    setCol('global_assets', [ws1, ws2])

    workspaceStore.set(
      { id: 'ws-1', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-1'],
    )

    const all = globalAssetRepository.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('Asset WS1')
  })

  it('getAll com workspace_ids múltiplos retorna assets de todos os workspaces do usuário', () => {
    const ws1 = makeAsset({ id: 'a1', workspace_id: 'ws-1', name: 'Asset WS1' })
    const ws2 = makeAsset({ id: 'a2', workspace_id: 'ws-2', name: 'Asset WS2' })
    const ws3 = makeAsset({ id: 'a3', workspace_id: 'ws-3', name: 'Asset WS3' })
    setCol('global_assets', [ws1, ws2, ws3])

    workspaceStore.set(null, false, ['ws-1', 'ws-2'])

    const all = globalAssetRepository.getAll()
    expect(all).toHaveLength(2)
    expect(all.map((a) => a.id)).toContain('a1')
    expect(all.map((a) => a.id)).toContain('a2')
    expect(all.map((a) => a.id)).not.toContain('a3')
  })

  it('usuário sem workspace_ids vê tudo (legado)', () => {
    const ws1 = makeAsset({ id: 'a1', workspace_id: 'ws-1' })
    const ws2 = makeAsset({ id: 'a2', workspace_id: 'ws-2' })
    setCol('global_assets', [ws1, ws2])

    workspaceStore.set(null, false, [])

    const all = globalAssetRepository.getAll()
    expect(all).toHaveLength(2)
  })

  it('super admin com workspace ativo vê só o workspace ativo', () => {
    const ws1 = makeAsset({ id: 'a1', workspace_id: 'ws-1' })
    const ws2 = makeAsset({ id: 'a2', workspace_id: 'ws-2' })
    setCol('global_assets', [ws1, ws2])

    workspaceStore.set(
      { id: 'ws-1', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      true,
      [],
    )

    const all = globalAssetRepository.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('a1')
  })
})

describe('globalAssetRepository — multi-workspace isolation (pull validation)', () => {
  it('usuário com acesso somente ao workspace A não recebe assets do workspace B', () => {
    const wsA1 = makeAsset({ id: 'a1', workspace_id: 'ws-A', name: 'Desktop Lab A1' })
    const wsA2 = makeAsset({ id: 'a2', workspace_id: 'ws-A', name: 'Monitor Lab A2' })
    const wsB1 = makeAsset({ id: 'b1', workspace_id: 'ws-B', name: 'Notebook Lab B1' })
    const wsB2 = makeAsset({ id: 'b2', workspace_id: 'ws-B', name: 'Projetor Lab B2' })
    const wsC1 = makeAsset({ id: 'c1', workspace_id: 'ws-C', name: 'Switch Lab C1' })

    setCol('global_assets', [wsA1, wsA2, wsB1, wsB2, wsC1])

    workspaceStore.set(
      { id: 'ws-A', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-A'],
    )

    const result = globalAssetRepository.getAll()

    expect(result).toHaveLength(2)
    expect(result.every((a) => a.workspace_id === 'ws-A')).toBe(true)
    expect(result.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('usuário com acesso a workspaces A e B não recebe assets do workspace C', () => {
    const wsA1 = makeAsset({ id: 'a1', workspace_id: 'ws-A' })
    const wsB1 = makeAsset({ id: 'b1', workspace_id: 'ws-B' })
    const wsC1 = makeAsset({ id: 'c1', workspace_id: 'ws-C' })

    setCol('global_assets', [wsA1, wsB1, wsC1])

    workspaceStore.set(null, false, ['ws-A', 'ws-B'])

    const result = globalAssetRepository.getAll()

    expect(result).toHaveLength(2)
    expect(result.map((a) => a.workspace_id).sort()).toEqual(['ws-A', 'ws-B'])
  })

  it('query também respeita isolamento de workspace', () => {
    const wsA1 = makeAsset({ id: 'a1', workspace_id: 'ws-A', status: 'active' })
    const wsA2 = makeAsset({ id: 'a2', workspace_id: 'ws-A', status: 'draft' })
    const wsB1 = makeAsset({ id: 'b1', workspace_id: 'ws-B', status: 'active' })

    setCol('global_assets', [wsA1, wsA2, wsB1])

    workspaceStore.set(
      { id: 'ws-A', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-A'],
    )

    const active = globalAssetRepository.query((a) => a.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0].workspace_id).toBe('ws-A')
    expect(active[0].id).toBe('a1')
  })

  it('getById não retorna asset de outro workspace', () => {
    const wsA = makeAsset({ id: 'a1', workspace_id: 'ws-A' })
    const wsB = makeAsset({ id: 'b1', workspace_id: 'ws-B' })

    setCol('global_assets', [wsA, wsB])

    workspaceStore.set(
      { id: 'ws-A', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-A'],
    )

    expect(globalAssetRepository.getById('a1')).toBeDefined()
    expect(globalAssetRepository.getById('b1')).toBeUndefined()
  })

  it('getByAssetTag não retorna asset de outro workspace', () => {
    const wsA = makeAsset({ id: 'a1', workspace_id: 'ws-A', asset_tag: 'PAT-001' })
    const wsB = makeAsset({ id: 'b1', workspace_id: 'ws-B', asset_tag: 'PAT-001' })

    setCol('global_assets', [wsA, wsB])

    workspaceStore.set(
      { id: 'ws-A', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-A'],
    )

    const found = globalAssetRepository.getByAssetTag('PAT-001')
    expect(found).toHaveLength(1)
    expect(found[0].workspace_id).toBe('ws-A')
  })

  it('getStats contabiliza apenas assets do workspace ativo', () => {
    const wsA1 = makeAsset({ id: 'a1', workspace_id: 'ws-A', equipment_type: 'Desktop', status: 'active' })
    const wsA2 = makeAsset({ id: 'a2', workspace_id: 'ws-A', equipment_type: 'Monitor', status: 'draft' })
    const wsB1 = makeAsset({ id: 'b1', workspace_id: 'ws-B', equipment_type: 'Desktop', status: 'active' })

    setCol('global_assets', [wsA1, wsA2, wsB1])

    workspaceStore.set(
      { id: 'ws-A', name: 'Campus A', slug: 'campus-a', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' },
      false,
      ['ws-A'],
    )

    const stats = globalAssetRepository.getStats()
    expect(stats.total).toBe(2)
    expect(stats.byStatus.active).toBe(1)
    expect(stats.byStatus.draft).toBe(1)
    expect(stats.byType.Desktop).toBe(1)
    expect(stats.byType.Monitor).toBe(1)
  })
})

describe('globalAssetRepository — sync config', () => {
  it('create marca coleção como dirty', () => {
    clearDirty('global_assets')

    globalAssetRepository.create({
      name: 'Dirty Test',
      equipment_type: 'Outro',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    expect(getDirtyCollections()).toContain('global_assets')
  })

  it('update marca coleção como dirty', () => {
    const asset = globalAssetRepository.create({
      name: 'Test',
      equipment_type: 'Outro',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    clearDirty('global_assets')
    globalAssetRepository.update(asset.id, { name: 'Updated' })
    expect(getDirtyCollections()).toContain('global_assets')
  })

  it('remove marca coleção como dirty e registra tombstone', () => {
    const asset = globalAssetRepository.create({
      name: 'Delete',
      equipment_type: 'Outro',
      manufacturer: '',
      model: '',
      asset_tag: null,
      serial_number: null,
      location_id: null,
      status: 'draft',
      notes: '',
      metadata: {},
    })

    clearDirty('global_assets')
    globalAssetRepository.remove(asset.id)

    expect(getDirtyCollections()).toContain('global_assets')
    const tombstones = JSON.parse(localStorage.getItem('labhub_deleted_ids') || '{}')
    expect(tombstones['global_assets']).toContain(asset.id)
  })
})

describe('globalAssetRepository — architecture boundary', () => {
  it('global-repository não importa de apps/*', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const repoPath = path.resolve(__dirname, '../global-repository.ts')
    const content = fs.readFileSync(repoPath, 'utf-8')
    const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || []

    for (const imp of imports) {
      expect(imp).not.toMatch(/apps\//)
    }
  })

  it('global-types não importa de apps/*', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const typesPath = path.resolve(__dirname, '../global-types.ts')
    const content = fs.readFileSync(typesPath, 'utf-8')
    const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || []

    for (const imp of imports) {
      expect(imp).not.toMatch(/apps\//)
    }
  })
})
