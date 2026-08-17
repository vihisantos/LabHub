import { defaultDb } from '../../lib/supabase'

export interface PasskeyItem {
  id: string
  friendlyName: string
  createdAt: string
  lastUsedAt?: string
}

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
}
