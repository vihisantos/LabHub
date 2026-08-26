import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../store', async () => {
  const actual = await vi.importActual<typeof import('../store')>('../store')
  return actual
})

import { workspaceStore } from '../store'

const WS_A = 'ws-aaaa-1111'
const WS_B = 'ws-bbbb-2222'
const WS_C = 'ws-cccc-3333'

function makeItem(wsId: string | null = null) {
  return { id: 'item-1', workspace_id: wsId }
}

describe('workspaceStore.matches — zero-trust isolation', () => {
  beforeEach(() => {
    workspaceStore.set(null, false, [])
  })

  describe('regular user (no super_admin)', () => {
    it('vê nada quando não tem workspace ativo e workspace_ids vazio', () => {
      workspaceStore.set(null, false, [])
      expect(workspaceStore.matches(makeItem(WS_A))).toBe(false)
    })

    it('vê apenas itens do workspace ativo', () => {
      workspaceStore.set(null, false, [WS_A])
      workspaceStore.set({ id: WS_A, name: '', slug: '', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' }, false, [WS_A])
      expect(workspaceStore.matches(makeItem(WS_A))).toBe(true)
      expect(workspaceStore.matches(makeItem(WS_B))).toBe(false)
    })

    it('NÃO vê itens com workspace_id null', () => {
      workspaceStore.set({ id: WS_A, name: '', slug: '', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' }, false, [WS_A])
      expect(workspaceStore.matches(makeItem(null))).toBe(false)
    })

    it('NÃO vê itens com workspace_id vazio', () => {
      workspaceStore.set({ id: WS_A, name: '', slug: '', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' }, false, [WS_A])
      expect(workspaceStore.matches(makeItem(''))).toBe(false)
    })

    it('com workspace_ids vê apenas itens dos seus workspaces', () => {
      workspaceStore.set(null, false, [WS_A, WS_B])
      expect(workspaceStore.matches(makeItem(WS_A))).toBe(true)
      expect(workspaceStore.matches(makeItem(WS_B))).toBe(true)
      expect(workspaceStore.matches(makeItem(WS_C))).toBe(false)
      expect(workspaceStore.matches(makeItem(null))).toBe(false)
    })
  })

  describe('super admin', () => {
    it('sem workspace ativo vê tudo (global view)', () => {
      workspaceStore.set(null, true, [WS_A, WS_B])
      expect(workspaceStore.matches(makeItem(WS_A))).toBe(true)
      expect(workspaceStore.matches(makeItem(WS_B))).toBe(true)
      expect(workspaceStore.matches(makeItem(null))).toBe(true)
      expect(workspaceStore.matches(makeItem(WS_C))).toBe(true)
    })

    it('com workspace ativo vê apenas o workspace ativo', () => {
      workspaceStore.set({ id: WS_A, name: '', slug: '', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' }, true, [WS_A, WS_B])
      expect(workspaceStore.matches(makeItem(WS_A))).toBe(true)
      expect(workspaceStore.matches(makeItem(WS_B))).toBe(false)
      expect(workspaceStore.matches(makeItem(null))).toBe(false)
    })
  })

  describe('filter', () => {
    it('filtra array corretamente pelo workspace ativo', () => {
      workspaceStore.set({ id: WS_A, name: '', slug: '', location: '', spreadsheet_url: '', color: '', disabled_apps: [], created_at: '', updated_at: '' }, false, [WS_A])
      const items = [
        { id: '1', workspace_id: WS_A },
        { id: '2', workspace_id: WS_B },
        { id: '3', workspace_id: null },
        { id: '4', workspace_id: '' },
      ]
      const result = workspaceStore.filter(items)
      expect(result.map((i) => i.id)).toEqual(['1'])
    })

    it('filtra array para vazio quando usuário não tem workspaces', () => {
      workspaceStore.set(null, false, [])
      const items = [
        { id: '1', workspace_id: WS_A },
        { id: '2', workspace_id: WS_B },
      ]
      expect(workspaceStore.filter(items)).toHaveLength(0)
    })
  })
})
