import { describe, it, expect, vi, beforeEach } from 'vitest'
import { workspaceService } from '../service'

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  return { mockFrom }
})

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom },
}))

function makeChain(remoteRows: any[] = []) {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.order = vi.fn(async () => ({ data: remoteRows, error: null }))
  chain.upsert = vi.fn(async () => ({ error: null }))
  chain.delete = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  chain.eq = vi.fn(() => chain)
  return chain
}

describe('workspaceService.create (toSnake)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockFrom.mockReturnValue(makeChain())
  })

  it('aplica defaults para color, disabled_apps e spreadsheet_url', async () => {
    const created = await workspaceService.create({ name: 'Escola A', slug: 'escola-a', location: '', spreadsheet_url: '' })

    expect(created.color).toBe('')
    expect(created.disabled_apps).toEqual([])
    expect(created.spreadsheet_url).toBe('')
    expect(created.location).toBe('')
    expect(workspaceService.getById(created.id)?.name).toBe('Escola A')
  })

  it('preserva color e disabled_apps informados', async () => {
    const created = await workspaceService.create({
      name: 'Escola B',
      slug: 'escola-b',
      color: '#f59e0b',
      disabled_apps: ['tv', 'stock'],
      spreadsheet_url: 'https://docs.google.com/spreadsheets/x',
      location: 'São Paulo, SP',
    })

    expect(created.color).toBe('#f59e0b')
    expect(created.disabled_apps).toEqual(['tv', 'stock'])
    expect(created.spreadsheet_url).toBe('https://docs.google.com/spreadsheets/x')
    expect(created.location).toBe('São Paulo, SP')
  })
})

describe('workspaceService.update', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockFrom.mockReturnValue(makeChain())
  })

  it('atualiza color e disabled_apps mantendo o restante', async () => {
    const created = await workspaceService.create({ name: 'Escola C', slug: 'escola-c', location: '', spreadsheet_url: '' })
    const updated = await workspaceService.update(created.id, {
      color: '#22c55e',
      disabled_apps: ['chamados'],
    })

    expect(updated?.color).toBe('#22c55e')
    expect(updated?.disabled_apps).toEqual(['chamados'])
    expect(updated?.name).toBe('Escola C')

    const stored = workspaceService.getById(created.id)
    expect(stored?.color).toBe('#22c55e')
    expect(stored?.disabled_apps).toEqual(['chamados'])
  })

  it('retorna undefined para id inexistente', async () => {
    const updated = await workspaceService.update('nao-existe', { color: '#000' })
    expect(updated).toBeUndefined()
  })
})

describe('workspaceService.remove', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockFrom.mockReturnValue(makeChain())
  })

  it('remove o workspace localmente', async () => {
    const created = await workspaceService.create({ name: 'Escola D', slug: 'escola-d', location: '', spreadsheet_url: '' })
    const ok = await workspaceService.remove(created.id)
    expect(ok).toBe(true)
    expect(workspaceService.getById(created.id)).toBeUndefined()
  })
})

describe('workspaceService.syncFromSupabase', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('insere no local workspaces que vieram do remoto', async () => {
    const remote = [{
      id: 'ws-1',
      name: 'Anhembi São José dos Campos',
      slug: 'anhembi-sao-jose-dos-campos',
      location: 'São José dos Campos - SP',
      spreadsheet_url: '',
      color: '',
      disabled_apps: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }]
    mockFrom.mockReturnValue(makeChain(remote))

    const result = await workspaceService.syncFromSupabase()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Anhembi São José dos Campos')
    expect(workspaceService.getById('ws-1')).toBeDefined()
  })

  it('atualiza local quando o remoto é mais recente', async () => {
    const created = await workspaceService.create({ name: 'Campus X', slug: 'campus-x', location: '', spreadsheet_url: '' })
    const remote = [{ ...created, name: 'Campus X Atualizado', updated_at: '2026-12-31T00:00:00.000Z' }]
    mockFrom.mockReturnValue(makeChain(remote))

    await workspaceService.syncFromSupabase()

    expect(workspaceService.getById(created.id)?.name).toBe('Campus X Atualizado')
  })

  it('remove do local workspaces que não existem mais no remoto', async () => {
    const created = await workspaceService.create({ name: 'Campus Y', slug: 'campus-y', location: '', spreadsheet_url: '' })
    mockFrom.mockReturnValue(makeChain([]))

    await workspaceService.syncFromSupabase()

    expect(workspaceService.getById(created.id)).toBeUndefined()
  })

  it('mantém o local quando o fetch remoto falha', async () => {
    const created = await workspaceService.create({ name: 'Campus Z', slug: 'campus-z', location: '', spreadsheet_url: '' })
    const chain = makeChain([])
    chain.order = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    mockFrom.mockReturnValue(chain)

    const result = await workspaceService.syncFromSupabase()

    expect(result).toHaveLength(1)
    expect(workspaceService.getById(created.id)).toBeDefined()
  })
})
