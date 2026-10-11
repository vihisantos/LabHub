import { describe, it, expect, vi } from 'vitest'

const { store } = vi.hoisted(() => ({
  store: { activeWorkspaceId: 'ws-1' as string | null },
}))

vi.mock('../../../lib/supabase', () => ({ defaultDb: null }))
vi.mock('../../workspaces/store', () => ({ workspaceStore: store }))

async function loadClient() {
  vi.resetModules()
  return import('../client')
}

describe('client — fail-closed sem conexão / sem unidade', () => {
  it('requireDb sem cliente configurado ⇒ not_configured', async () => {
    const { requireDb } = await loadClient()
    expect(() => requireDb()).toThrowError(
      expect.objectContaining({ code: 'not_configured' }) as Error,
    )
  })

  it('activeWorkspaceId sem unidade ativa ⇒ no_workspace', async () => {
    store.activeWorkspaceId = null
    const { activeWorkspaceId } = await loadClient()
    expect(() => activeWorkspaceId()).toThrowError(
      expect.objectContaining({ code: 'no_workspace' }) as Error,
    )
  })

  it('activeWorkspaceId devolve a unidade ativa quando presente', async () => {
    store.activeWorkspaceId = 'ws-7'
    const { activeWorkspaceId } = await loadClient()
    expect(activeWorkspaceId()).toBe('ws-7')
  })
})
