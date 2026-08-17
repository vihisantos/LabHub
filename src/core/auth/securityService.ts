import { defaultDb } from '../../lib/supabase'

export interface PasskeyItem {
  id: string
  friendlyName: string
  createdAt: string
  lastUsedAt?: string
}

export interface MfaFactor {
  id: string
  friendlyName?: string
  factorType: 'webauthn' | 'totp' | 'phone'
  createdAt: string
}

export type AssuranceLevel = 'aal1' | 'aal2' | (string & {})

function requireDb() {
  if (!defaultDb) throw new Error('Supabase não configurado. Verifique as variáveis de ambiente.')
}

/** Navegador suporta WebAuthn (Passkeys)? */
export function browserSupportsPasskey(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

export const securityService = {
  // ─── Passkeys (login sem senha) ────────────────────────────────────────────

  /** Login completo com passkey (cerimônia WebAuthn inteira feita pelo cliente). */
  signInWithPasskey: async (): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.signInWithPasskey()
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  /** Cadastra uma passkey para o usuário autenticado. */
  registerPasskey: async (): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.registerPasskey()
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  listPasskeys: async (): Promise<PasskeyItem[]> => {
    requireDb()
    const { data, error } = await defaultDb!.auth.passkey.list()
    if (error || !data) return []
    return data.map((p) => ({
      id: p.id,
      friendlyName: p.friendly_name || 'Passkey',
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
    }))
  },

  renamePasskey: async (id: string, friendlyName: string): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.passkey.update({ passkeyId: id, friendlyName })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  deletePasskey: async (id: string): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.passkey.delete({ passkeyId: id })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  // ─── MFA WebAuthn (segundo fator com biometria) ────────────────────────────

  /** Níveis de autenticação: se nextLevel for aal2 e currentLevel aal1, MFA é necessário. */
  getAssuranceLevel: async (): Promise<{ currentLevel: AssuranceLevel | null; nextLevel: AssuranceLevel | null }> => {
    requireDb()
    const { data, error } = await defaultDb!.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data) return { currentLevel: null, nextLevel: null }
    return { currentLevel: data.currentLevel, nextLevel: data.nextLevel }
  },

  listFactors: async (): Promise<{ webauthn: MfaFactor[]; totp: MfaFactor[]; all: MfaFactor[] }> => {
    requireDb()
    const empty = { webauthn: [], totp: [], all: [] }
    const { data, error } = await defaultDb!.auth.mfa.listFactors()
    if (error || !data) return empty
    const map = (f: { id: string; friendly_name?: string; factor_type: 'webauthn' | 'totp' | 'phone'; created_at?: string }): MfaFactor => ({
      id: f.id,
      friendlyName: f.friendly_name,
      factorType: f.factor_type,
      createdAt: f.created_at || '',
    })
    return {
      webauthn: data.webauthn.map(map),
      totp: data.totp.map(map),
      all: data.all.map(map),
    }
  },

  /** Cadastra um fator WebAuthn (cerimônia completa: enroll + challenge + verify). */
  enrollWebauthn: async (friendlyName: string): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.mfa.webauthn.register({ friendlyName })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  /** Autentica com um fator WebAuthn existente (cerimônia completa). */
  authenticateWebauthn: async (factorId: string): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.mfa.webauthn.authenticate({ factorId })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  unenrollFactor: async (factorId: string): Promise<{ ok: boolean; error?: string }> => {
    requireDb()
    const { error } = await defaultDb!.auth.mfa.unenroll({ factorId })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },
}
