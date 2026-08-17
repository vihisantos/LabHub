import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabaseState = vi.hoisted(() => ({
  defaultDb: {
    auth: {
      signInWithPasskey: vi.fn(),
      registerPasskey: vi.fn(),
      passkey: {
        list: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  },
}))

vi.mock('../../../lib/supabase', () => ({
  get defaultDb() {
    return mockSupabaseState.defaultDb
  },
}))

async function loadService() {
  vi.resetModules()
  const mod = await import('../securityService')
  return mod
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('securityService — passkeys', () => {
  it('signInWithPasskey retorna ok true quando não há erro', async () => {
    mockSupabaseState.defaultDb.auth.signInWithPasskey.mockResolvedValue({ data: {}, error: null })
    const { securityService } = await loadService()
    const res = await securityService.signInWithPasskey()
    expect(res.ok).toBe(true)
    expect(res.error).toBeUndefined()
  })

  it('signInWithPasskey retorna erro quando o Supabase falha', async () => {
    mockSupabaseState.defaultDb.auth.signInWithPasskey.mockResolvedValue({
      data: {},
      error: { message: 'Cancelado pelo usuário' },
    })
    const { securityService } = await loadService()
    const res = await securityService.signInWithPasskey()
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Cancelado pelo usuário')
  })

  it('registerPasskey chama a API e reporta sucesso', async () => {
    mockSupabaseState.defaultDb.auth.registerPasskey.mockResolvedValue({ data: {}, error: null })
    const { securityService } = await loadService()
    const res = await securityService.registerPasskey()
    expect(res.ok).toBe(true)
  })

  it('listPasskeys mapeia os campos do Supabase', async () => {
    mockSupabaseState.defaultDb.auth.passkey.list.mockResolvedValue({
      data: [
        { id: 'pk-1', friendly_name: 'iPhone', created_at: '2026-01-01T00:00:00Z', last_used_at: '2026-06-01T00:00:00Z' },
        { id: 'pk-2', created_at: '2026-02-01T00:00:00Z' },
      ],
      error: null,
    })
    const { securityService } = await loadService()
    const list = await securityService.listPasskeys()
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({
      id: 'pk-1',
      friendlyName: 'iPhone',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-06-01T00:00:00Z',
    })
    expect(list[1].friendlyName).toBe('Passkey')
  })

  it('listPasskeys retorna [] quando há erro', async () => {
    mockSupabaseState.defaultDb.auth.passkey.list.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { securityService } = await loadService()
    const list = await securityService.listPasskeys()
    expect(list).toEqual([])
  })

  it('renamePasskey envia passkeyId e friendlyName', async () => {
    mockSupabaseState.defaultDb.auth.passkey.update.mockResolvedValue({ data: {}, error: null })
    const { securityService } = await loadService()
    const res = await securityService.renamePasskey('pk-1', 'Notebook')
    expect(res.ok).toBe(true)
    expect(mockSupabaseState.defaultDb.auth.passkey.update).toHaveBeenCalledWith({
      passkeyId: 'pk-1',
      friendlyName: 'Notebook',
    })
  })

  it('deletePasskey chama a API com o id', async () => {
    mockSupabaseState.defaultDb.auth.passkey.delete.mockResolvedValue({ data: null, error: null })
    const { securityService } = await loadService()
    const res = await securityService.deletePasskey('pk-1')
    expect(res.ok).toBe(true)
    expect(mockSupabaseState.defaultDb.auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: 'pk-1' })
  })
})

describe('browserSupportsPasskey', () => {
  it('retorna true quando PublicKeyCredential existe', async () => {
    ;(globalThis as any).PublicKeyCredential = class {}
    const { browserSupportsPasskey } = await loadService()
    expect(browserSupportsPasskey()).toBe(true)
  })

  it('retorna false quando PublicKeyCredential não existe', async () => {
    delete (globalThis as any).PublicKeyCredential
    const { browserSupportsPasskey } = await loadService()
    expect(browserSupportsPasskey()).toBe(false)
  })
})
