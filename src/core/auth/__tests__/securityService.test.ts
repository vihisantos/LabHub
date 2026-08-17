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
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(),
        listFactors: vi.fn(),
        webauthn: {
          register: vi.fn(),
          authenticate: vi.fn(),
        },
        unenroll: vi.fn(),
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

describe('securityService — MFA WebAuthn', () => {
  it('getAssuranceLevel retorna aal1→aal2 quando MFA é necessário', async () => {
    mockSupabaseState.defaultDb.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    const { securityService } = await loadService()
    const aal = await securityService.getAssuranceLevel()
    expect(aal.currentLevel).toBe('aal1')
    expect(aal.nextLevel).toBe('aal2')
  })

  it('getAssuranceLevel retorna nulls quando há erro', async () => {
    mockSupabaseState.defaultDb.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })
    const { securityService } = await loadService()
    const aal = await securityService.getAssuranceLevel()
    expect(aal.currentLevel).toBeNull()
    expect(aal.nextLevel).toBeNull()
  })

  it('listFactors separa webauthn dos demais fatores', async () => {
    mockSupabaseState.defaultDb.auth.mfa.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: 'f1', factor_type: 'webauthn', friendly_name: 'Touch ID', created_at: '2026-01-01T00:00:00Z', status: 'verified' },
          { id: 'f2', factor_type: 'totp', friendly_name: 'App', created_at: '2026-01-01T00:00:00Z', status: 'verified' },
        ],
        webauthn: [{ id: 'f1', factor_type: 'webauthn', friendly_name: 'Touch ID', created_at: '2026-01-01T00:00:00Z', status: 'verified' }],
        totp: [{ id: 'f2', factor_type: 'totp', friendly_name: 'App', created_at: '2026-01-01T00:00:00Z', status: 'verified' }],
      },
      error: null,
    })
    const { securityService } = await loadService()
    const f = await securityService.listFactors()
    expect(f.webauthn).toHaveLength(1)
    expect(f.webauthn[0].id).toBe('f1')
    expect(f.totp).toHaveLength(1)
  })

  it('enrollWebauthn usa o fator webauthn', async () => {
    mockSupabaseState.defaultDb.auth.mfa.webauthn.register.mockResolvedValue({ data: {}, error: null })
    const { securityService } = await loadService()
    const res = await securityService.enrollWebauthn('Minha biometria')
    expect(res.ok).toBe(true)
    expect(mockSupabaseState.defaultDb.auth.mfa.webauthn.register).toHaveBeenCalledWith({
      friendlyName: 'Minha biometria',
    })
  })

  it('authenticateWebauthn repassa o factorId', async () => {
    mockSupabaseState.defaultDb.auth.mfa.webauthn.authenticate.mockResolvedValue({ data: {}, error: null })
    const { securityService } = await loadService()
    const res = await securityService.authenticateWebauthn('f1')
    expect(res.ok).toBe(true)
    expect(mockSupabaseState.defaultDb.auth.mfa.webauthn.authenticate).toHaveBeenCalledWith({ factorId: 'f1' })
  })

  it('unenrollFactor remove o fator', async () => {
    mockSupabaseState.defaultDb.auth.mfa.unenroll.mockResolvedValue({ data: null, error: null })
    const { securityService } = await loadService()
    const res = await securityService.unenrollFactor('f1')
    expect(res.ok).toBe(true)
    expect(mockSupabaseState.defaultDb.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' })
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
