import { describe, it, expect, vi } from 'vitest'
import { workspaceService } from '../service'
import type { Workspace } from '../types'

vi.mock('../../../lib/supabase', () => ({ defaultDb: undefined }))

describe('workspaceService.create (toSnake)', () => {
  it('aplica defaults para color, disabled_apps e spreadsheet_url', async () => {
    const created = await workspaceService.create({ name: 'Escola A', slug: 'escola-a' })

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
  it('atualiza color e disabled_apps mantendo o restante', async () => {
    const created = await workspaceService.create({ name: 'Escola C', slug: 'escola-c' })
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
  it('remove o workspace localmente', async () => {
    const created = await workspaceService.create({ name: 'Escola D', slug: 'escola-d' })
    const ok = await workspaceService.remove(created.id)
    expect(ok).toBe(true)
    expect(workspaceService.getById(created.id)).toBeUndefined()
  })
})
