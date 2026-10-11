import { defaultDb } from '../../lib/supabase'
import { workspaceStore } from '../workspaces/store'
import { authService } from '../auth/service'
import { PatrimonioError } from './errors'

/**
 * Cliente Supabase da SESSÃO do usuário (token do Supabase Auth).
 *
 * Toda leitura/escrita passa por aqui — nunca por `service_role`. A autorização
 * é decidida pela RLS + RBAC (`user_has_action`) no banco; a camada de dados não
 * é a barreira de segurança e não tenta substituí-la (não inventa permissões,
 * não "conserta" RLS no client). Ver `docs/patrimonio/data-layer.md`.
 */
export function requireDb() {
  if (!defaultDb) {
    throw new PatrimonioError('not_configured')
  }
  return defaultDb
}

/**
 * Workspace (unidade) ativo da sessão. Fail-closed: sem unidade ativa não há
 * operação de Patrimônio — nem leitura escopada, nem escrita.
 */
export function activeWorkspaceId(): string {
  const ws = workspaceStore.activeWorkspaceId
  if (!ws) {
    throw new PatrimonioError('no_workspace')
  }
  return ws
}

/** Id do usuário autenticado, ou null (usado só para `created_by`). */
export function currentUserId(): string | null {
  return authService.getCurrentUser()?.id ?? null
}

export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Normaliza o resultado de `.select()` para uma lista de linhas cruas.
 * `data` pode vir `null` em erro (já tratado antes) ou não-array em casos
 * inesperados — devolvemos `[]` para nunca propagar um cast de `any`.
 */
export function toRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : []
}

/**
 * Normaliza o resultado de `.select().single()`/`.maybeSingle()` para uma linha
 * crua ou `null`.
 */
export function toRow(data: unknown): unknown | null {
  if (data === null || data === undefined) return null
  if (Array.isArray(data)) return data.length > 0 ? data[0] : null
  if (typeof data === 'object') return data
  return null
}

/** Acessa um campo de um objeto desconhecido sem `any`. */
export function field(row: unknown, key: string): unknown {
  if (typeof row !== 'object' || row === null) return undefined
  return (row as Record<string, unknown>)[key]
}

/** Lê uma string obrigatória; `fallback` quando ausente/não-string. */
export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** Lê uma string opcional (null quando ausente/vazia). */
export function asNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

/** Lê um objeto JSON; `{}` quando ausente/inválido. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
